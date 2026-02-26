/**
 * Static import parser
 * Extracts import/export relationships from source files using regex patterns.
 * Replaces the LLM-based Dependency Mapper agent for standard import/export analysis.
 *
 * Supports: TypeScript/JavaScript, Python, Go, Rust, Java, C/C++, Ruby, PHP
 */

import { readFile } from 'node:fs/promises';
import { dirname, resolve, relative, extname } from 'node:path';
import type { FileInfo } from './file-discovery.js';
import type { AgentResult } from '../agents/runner.js';
import {
  type DependencyGraph,
  type GraphNode,
  type Edge,
  createGraph,
  getCentrality,
  getEntryPoints,
} from './dependency-graph.js';

export interface ParsedImport {
  /** The file that contains the import statement */
  sourceFile: string;
  /** The raw import specifier as written in code */
  rawSpecifier: string;
  /** The resolved relative path to the imported file (if resolvable) */
  resolvedPath: string | undefined;
}

// ---------------------------------------------------------------------------
// Language-specific import regex patterns
// ---------------------------------------------------------------------------

/**
 * Extracts import specifiers from a single file's content based on its extension.
 * Returns raw specifier strings (not yet resolved to file paths).
 */
function extractRawImports(content: string, ext: string): string[] {
  const specifiers: string[] = [];

  switch (ext) {
    case '.ts':
    case '.tsx':
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs': {
      // ES module imports: import ... from 'specifier'
      const esImportRe = /import\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
      let m: RegExpExecArray | null;
      while ((m = esImportRe.exec(content)) !== null) {
        specifiers.push(m[1]);
      }
      // Side-effect imports: import 'specifier'
      const sideEffectRe = /import\s+['"]([^'"]+)['"]/g;
      while ((m = sideEffectRe.exec(content)) !== null) {
        specifiers.push(m[1]);
      }
      // Dynamic imports: import('specifier')
      const dynamicRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
      while ((m = dynamicRe.exec(content)) !== null) {
        specifiers.push(m[1]);
      }
      // CommonJS require: require('specifier')
      const requireRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
      while ((m = requireRe.exec(content)) !== null) {
        specifiers.push(m[1]);
      }
      break;
    }

    case '.py': {
      // Python: import module / from module import ...
      const pyImportRe = /^\s*import\s+([\w.]+)/gm;
      let m: RegExpExecArray | null;
      while ((m = pyImportRe.exec(content)) !== null) {
        specifiers.push(m[1]);
      }
      const pyFromRe = /^\s*from\s+([\w.]+)\s+import/gm;
      while ((m = pyFromRe.exec(content)) !== null) {
        specifiers.push(m[1]);
      }
      break;
    }

    case '.go': {
      // Go: import "pkg" or import ( "pkg1" \n "pkg2" )
      const goSingleRe = /import\s+"([^"]+)"/g;
      let m: RegExpExecArray | null;
      while ((m = goSingleRe.exec(content)) !== null) {
        specifiers.push(m[1]);
      }
      const goGroupRe = /import\s*\(([\s\S]*?)\)/g;
      while ((m = goGroupRe.exec(content)) !== null) {
        const block = m[1];
        const pkgRe = /"([^"]+)"/g;
        let pm: RegExpExecArray | null;
        while ((pm = pkgRe.exec(block)) !== null) {
          specifiers.push(pm[1]);
        }
      }
      break;
    }

    case '.rs': {
      // Rust: use crate::module / use module::submod
      const rustRe = /^\s*use\s+([\w:]+)/gm;
      let m: RegExpExecArray | null;
      while ((m = rustRe.exec(content)) !== null) {
        specifiers.push(m[1]);
      }
      break;
    }

    case '.java':
    case '.kt':
    case '.scala': {
      // Java/Kotlin/Scala: import com.example.Class
      const javaRe = /^\s*import\s+(?:static\s+)?([\w.]+)/gm;
      let m: RegExpExecArray | null;
      while ((m = javaRe.exec(content)) !== null) {
        specifiers.push(m[1]);
      }
      break;
    }

    case '.c':
    case '.cpp':
    case '.h':
    case '.hpp':
    case '.cc': {
      // C/C++: #include "header.h" (local includes only, not <system>)
      const includeRe = /^\s*#include\s+"([^"]+)"/gm;
      let m: RegExpExecArray | null;
      while ((m = includeRe.exec(content)) !== null) {
        specifiers.push(m[1]);
      }
      break;
    }

    case '.rb': {
      // Ruby: require 'file' / require_relative 'file'
      const rubyRe = /^\s*require(?:_relative)?\s+['"]([^'"]+)['"]/gm;
      let m: RegExpExecArray | null;
      while ((m = rubyRe.exec(content)) !== null) {
        specifiers.push(m[1]);
      }
      break;
    }

    case '.php': {
      // PHP: use Namespace\Class / require 'file' / include 'file'
      const phpUseRe = /^\s*use\s+([\w\\]+)/gm;
      let m: RegExpExecArray | null;
      while ((m = phpUseRe.exec(content)) !== null) {
        specifiers.push(m[1]);
      }
      const phpReqRe = /(?:require|include)(?:_once)?\s+['"]([^'"]+)['"]/g;
      while ((m = phpReqRe.exec(content)) !== null) {
        specifiers.push(m[1]);
      }
      break;
    }
  }

  return specifiers;
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/** Common extensions to try when resolving specifiers without extensions */
const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

/**
 * Attempts to resolve a relative import specifier to a file in the project.
 * Returns the relative path from projectPath if found, or undefined.
 */
function resolveSpecifier(
  specifier: string,
  sourceFile: string,
  relativePathSet: Set<string>,
  projectPath: string,
): string | undefined {
  // Skip non-relative imports (npm packages, built-in modules)
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
    return undefined;
  }

  const sourceDir = dirname(sourceFile);
  const absBase = resolve(projectPath, sourceDir, specifier);
  const relBase = relative(projectPath, absBase);

  // Try exact match
  if (relativePathSet.has(relBase)) return relBase;

  // Try with common extensions
  for (const ext of RESOLVE_EXTENSIONS) {
    const withExt = relBase + ext;
    if (relativePathSet.has(withExt)) return withExt;
  }

  // Try as directory with index file
  for (const ext of RESOLVE_EXTENSIONS) {
    const indexPath = relBase + '/index' + ext;
    if (relativePathSet.has(indexPath)) return indexPath;
  }

  // Strip .js extension and try .ts (common in TS projects with ESM imports)
  if (specifier.endsWith('.js')) {
    const tsSpecifier = specifier.slice(0, -3) + '.ts';
    const tsBase = relative(projectPath, resolve(projectPath, sourceDir, tsSpecifier));
    if (relativePathSet.has(tsBase)) return tsBase;
    const tsxBase = relative(
      projectPath,
      resolve(projectPath, sourceDir, specifier.slice(0, -3) + '.tsx'),
    );
    if (relativePathSet.has(tsxBase)) return tsxBase;
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Export extraction (for exportedSymbols)
// ---------------------------------------------------------------------------

function extractExportedSymbols(content: string, ext: string): string[] {
  const symbols: string[] = [];

  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
    // Named exports: export function/const/class/interface/type/enum name
    const namedRe =
      /export\s+(?:default\s+)?(?:function|const|let|var|class|interface|type|enum)\s+(\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = namedRe.exec(content)) !== null) {
      symbols.push(m[1]);
    }
    // Export list: export { a, b, c }
    const listRe = /export\s*\{([^}]+)\}/g;
    while ((m = listRe.exec(content)) !== null) {
      const items = m[1].split(',').map((s) =>
        s
          .trim()
          .split(/\s+as\s+/)[0]
          .trim(),
      );
      symbols.push(...items.filter((s) => s && s !== 'type'));
    }
    // Default export
    if (/export\s+default\s/.test(content)) {
      symbols.push('default');
    }
  }

  return [...new Set(symbols)];
}

// ---------------------------------------------------------------------------
// Main parsing function
// ---------------------------------------------------------------------------

/**
 * Parses all import relationships from discovered files and builds a DependencyGraph.
 * Also returns a synthetic AgentResult matching the Dependency Mapper output schema.
 */
export async function parseImports(
  files: FileInfo[],
  projectPath: string,
): Promise<{ graph: DependencyGraph; agentResult: AgentResult }> {
  // Normalize projectPath
  const normalizedBase = projectPath.endsWith('/') ? projectPath.slice(0, -1) : projectPath;

  // Build a set of relative paths for resolution
  const relativePathSet = new Set<string>();
  const absToRel = new Map<string, string>();
  for (const file of files) {
    const rel = file.path.startsWith(normalizedBase + '/')
      ? file.path.slice(normalizedBase.length + 1)
      : file.path;
    relativePathSet.add(rel);
    absToRel.set(file.path, rel);
  }

  // Parse imports from each file
  const graph = createGraph();
  const edges: Edge[] = [];

  // Track in-degree and out-degree for scoring
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();

  for (const file of files) {
    const rel = absToRel.get(file.path)!;
    const ext = extname(file.path).toLowerCase();

    // Initialize node
    inDegree.set(rel, 0);
    outDegree.set(rel, 0);

    let content: string;
    try {
      content = await readFile(file.path, 'utf-8');
    } catch {
      continue;
    }

    // Determine node type
    const exportedSymbols = extractExportedSymbols(content, ext);
    const isBarrel =
      (rel.endsWith('/index.ts') ||
        rel.endsWith('/index.js') ||
        rel === 'index.ts' ||
        rel === 'index.js') &&
      /export\s*\{/.test(content) &&
      /from\s+['"]/.test(content);
    const hasMainClass = /export\s+(default\s+)?class\s+\w+/.test(content);
    const hasMainFunction = /export\s+(default\s+)?function\s+\w+/.test(content) && !hasMainClass;

    let nodeType: GraphNode['type'] = 'file';
    if (isBarrel) nodeType = 'module';
    else if (hasMainClass) nodeType = 'class';
    else if (hasMainFunction) nodeType = 'function';

    const graphNode: GraphNode = {
      id: rel,
      type: nodeType,
      metadata: {
        language: inferLanguageFromExt(ext),
        lineCount: file.lineCount,
        exportedSymbols,
      },
    };
    graph.nodes.set(rel, graphNode);

    // Extract and resolve imports
    const rawSpecifiers = extractRawImports(content, ext);
    const seenTargets = new Set<string>();

    for (const spec of rawSpecifiers) {
      const resolved = resolveSpecifier(spec, rel, relativePathSet, normalizedBase);
      if (resolved && resolved !== rel && !seenTargets.has(resolved)) {
        seenTargets.add(resolved);

        // Count how many symbols are imported to determine weight
        const weight = 5; // Default "imports" weight
        edges.push({
          source: rel,
          target: resolved,
          type: 'imports',
          weight,
        });

        outDegree.set(rel, (outDegree.get(rel) ?? 0) + 1);
        inDegree.set(resolved, (inDegree.get(resolved) ?? 0) + 1);
      }
    }
  }

  // Add edges to graph
  graph.edges.push(...edges);

  // Ensure all targets have nodes (they may be in the file list but not yet added)
  for (const edge of edges) {
    if (!graph.nodes.has(edge.target)) {
      const targetFile = files.find((f) => absToRel.get(f.path) === edge.target);
      if (targetFile) {
        graph.nodes.set(edge.target, {
          id: edge.target,
          type: 'file',
          metadata: {
            language: inferLanguageFromExt(extname(targetFile.path).toLowerCase()),
            lineCount: targetFile.lineCount,
            exportedSymbols: [],
          },
        });
      }
    }
  }

  // Compute scores for each node
  const maxDepth = computeMaxDepth(graph);

  const outputNodes: Record<string, unknown>[] = [];
  for (const [id, node] of graph.nodes) {
    const fanIn = inDegree.get(id) ?? 0;
    const fanOut = outDegree.get(id) ?? 0;
    const depth = computeNodeDepth(graph, id);
    const couplingDepth = maxDepth > 0 ? Math.round((depth / maxDepth) * 10) : 0;
    const centrality = getCentrality(graph, id);

    // Map raw counts to 0-10 scores
    const fanInScore = countToScore(fanIn);
    const fanOutScore = countToScore(fanOut);

    outputNodes.push({
      id,
      type: node.type,
      exportedSymbols: node.metadata.exportedSymbols,
      fanIn: fanInScore,
      fanOut: fanOutScore,
      couplingDepth,
      centrality,
    });
  }

  const outputEdges = edges.map((e) => ({
    source: e.source,
    target: e.target,
    type: e.type,
    weight: e.weight,
  }));

  // Generate summary
  const entryPoints = getEntryPoints(graph);
  const hubNodes = outputNodes
    .filter((n) => (n.centrality as number) >= 7)
    .map((n) => n.id as string);
  const summary = `Static analysis found ${graph.nodes.size} files with ${edges.length} import relationships. ${entryPoints.length} entry point(s) detected. ${hubNodes.length > 0 ? `Hub modules: ${hubNodes.join(', ')}.` : 'No dominant hub modules found.'}`;

  const agentResult: AgentResult = {
    agentName: 'Dependency Mapper',
    output: {
      nodes: outputNodes,
      edges: outputEdges,
      summary,
    },
    rawContent: JSON.stringify({ nodes: outputNodes, edges: outputEdges, summary }),
    tokenUsage: { inputTokens: 0, outputTokens: 0 },
  };

  return { graph, agentResult };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function inferLanguageFromExt(ext: string): string {
  const langMap: Record<string, string> = {
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript',
    '.mjs': 'JavaScript',
    '.cjs': 'JavaScript',
    '.py': 'Python',
    '.go': 'Go',
    '.rs': 'Rust',
    '.java': 'Java',
    '.kt': 'Kotlin',
    '.rb': 'Ruby',
    '.php': 'PHP',
    '.c': 'C',
    '.cpp': 'C++',
    '.cc': 'C++',
    '.h': 'C',
    '.hpp': 'C++',
    '.scala': 'Scala',
  };
  return langMap[ext] ?? 'Unknown';
}

/** Maps a raw import/dependent count to a 0-10 score per the agent spec */
function countToScore(count: number): number {
  if (count === 0) return 0;
  if (count <= 2) return Math.min(3, count + 1);
  if (count <= 5) return Math.min(6, count);
  if (count <= 10) return Math.min(9, count);
  return 10;
}

/**
 * Computes the maximum depth in the import chain using BFS from entry points.
 */
function computeMaxDepth(graph: DependencyGraph): number {
  const entryPoints = getEntryPoints(graph);
  if (entryPoints.length === 0) return 0;

  // Build adjacency list (source -> targets)
  const adj = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!adj.has(edge.source)) adj.set(edge.source, []);
    adj.get(edge.source)!.push(edge.target);
  }

  let maxDepth = 0;
  const depths = new Map<string, number>();

  // BFS from each entry point
  for (const ep of entryPoints) {
    if (depths.has(ep)) continue;
    depths.set(ep, 0);
    const queue: string[] = [ep];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentDepth = depths.get(current)!;
      const neighbors = adj.get(current) ?? [];

      for (const neighbor of neighbors) {
        if (!depths.has(neighbor) || depths.get(neighbor)! < currentDepth + 1) {
          depths.set(neighbor, currentDepth + 1);
          maxDepth = Math.max(maxDepth, currentDepth + 1);
          queue.push(neighbor);
        }
      }
    }
  }

  return maxDepth;
}

/**
 * Computes depth of a single node from entry points.
 */
function computeNodeDepth(graph: DependencyGraph, nodeId: string): number {
  // Build reverse adjacency list (target -> sources that import it)
  const reverseAdj = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!reverseAdj.has(edge.target)) reverseAdj.set(edge.target, []);
    reverseAdj.get(edge.target)!.push(edge.source);
  }

  // BFS backwards from nodeId to find shortest path to an entry point
  const entryPoints = new Set(getEntryPoints(graph));
  if (entryPoints.has(nodeId)) return 0;

  // Instead, compute forward depth from entry points
  const adj = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!adj.has(edge.source)) adj.set(edge.source, []);
    adj.get(edge.source)!.push(edge.target);
  }

  const depths = new Map<string, number>();
  for (const ep of entryPoints) {
    depths.set(ep, 0);
    const queue: string[] = [ep];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentDepth = depths.get(current)!;
      for (const neighbor of adj.get(current) ?? []) {
        if (!depths.has(neighbor)) {
          depths.set(neighbor, currentDepth + 1);
          queue.push(neighbor);
        }
      }
    }
  }

  return depths.get(nodeId) ?? 0;
}
