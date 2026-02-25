/**
 * Dependency graph
 * In-memory graph structure built from the Dependency Mapper agent's output.
 * Supports impact scoring, centrality, bottleneck detection, and clustering.
 */

import type { FileInfo } from './file-discovery.js';

export interface GraphNode {
  id: string;
  type: 'file' | 'function' | 'class' | 'module';
  metadata: {
    language: string;
    lineCount: number;
    exportedSymbols: string[];
  };
}

export interface Edge {
  source: string;
  target: string;
  type: 'imports' | 'calls' | 'extends' | 'implements' | 'uses';
  weight: number;
}

export interface DependencyGraph {
  nodes: Map<string, GraphNode>;
  edges: Edge[];
}

/**
 * Infers programming language from file extension.
 * Used to populate GraphNode.metadata.language without asking the LLM.
 */
function inferLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const langMap: Record<string, string> = {
    ts: 'TypeScript',
    tsx: 'TypeScript',
    js: 'JavaScript',
    jsx: 'JavaScript',
    py: 'Python',
    go: 'Go',
    rs: 'Rust',
    java: 'Java',
    kt: 'Kotlin',
    rb: 'Ruby',
    php: 'PHP',
    c: 'C',
    cpp: 'C++',
    h: 'C',
    hpp: 'C++',
    cs: 'C#',
    swift: 'Swift',
    scala: 'Scala',
    md: 'Markdown',
    json: 'JSON',
    yaml: 'YAML',
    yml: 'YAML',
    toml: 'TOML',
    sql: 'SQL',
    sh: 'Shell',
    bash: 'Shell',
  };
  return langMap[ext] ?? 'Unknown';
}

/** Type guard for valid node types */
function isValidNodeType(t: unknown): t is GraphNode['type'] {
  return t === 'file' || t === 'function' || t === 'class' || t === 'module';
}

/** Type guard for valid edge types */
function isValidEdgeType(t: unknown): t is Edge['type'] {
  return t === 'imports' || t === 'calls' || t === 'extends' || t === 'implements' || t === 'uses';
}

export function createGraph(): DependencyGraph {
  return { nodes: new Map(), edges: [] };
}

/**
 * Builds a DependencyGraph from the dependency mapper agent's JSON output.
 *
 * The mapper output is expected to have:
 *   - nodes: Array of { id, type, exportedSymbols, fanIn, fanOut, couplingDepth, centrality }
 *   - edges: Array of { source, target, type, weight }
 *
 * Language and lineCount are populated from the FileInfo list (not from the LLM),
 * since the LLM cannot reliably report these values.
 *
 * @param mapperOutput - The parsed JSON output from the dependency mapper agent
 * @param files - The FileInfo list from file discovery (used for language and lineCount)
 * @returns A populated DependencyGraph
 */
export function buildGraph(
  mapperOutput: Record<string, unknown>,
  files: FileInfo[],
): DependencyGraph {
  const graph = createGraph();

  // Helper to find FileInfo by relative path (match suffix of absolute path)
  function findFileInfo(relPath: string): FileInfo | undefined {
    for (const file of files) {
      if (file.path.endsWith('/' + relPath) || file.path === relPath) {
        return file;
      }
    }
    return undefined;
  }

  // Parse nodes from mapper output
  const rawNodes = Array.isArray(mapperOutput.nodes) ? mapperOutput.nodes : [];
  for (const raw of rawNodes) {
    if (typeof raw !== 'object' || raw === null) continue;
    const node = raw as Record<string, unknown>;
    const id = typeof node.id === 'string' ? node.id : '';
    if (!id) continue;

    const fileInfo = findFileInfo(id);
    const graphNode: GraphNode = {
      id,
      type: isValidNodeType(node.type) ? node.type : 'file',
      metadata: {
        language: fileInfo ? inferLanguage(fileInfo.path) : inferLanguage(id),
        lineCount: fileInfo?.lineCount ?? 0,
        exportedSymbols: Array.isArray(node.exportedSymbols)
          ? (node.exportedSymbols as string[]).filter((s) => typeof s === 'string')
          : [],
      },
    };
    graph.nodes.set(id, graphNode);
  }

  // Parse edges from mapper output
  const rawEdges = Array.isArray(mapperOutput.edges) ? mapperOutput.edges : [];
  for (const raw of rawEdges) {
    if (typeof raw !== 'object' || raw === null) continue;
    const edgeData = raw as Record<string, unknown>;
    const source = typeof edgeData.source === 'string' ? edgeData.source : '';
    const target = typeof edgeData.target === 'string' ? edgeData.target : '';
    if (!source || !target) continue;

    const edge: Edge = {
      source,
      target,
      type: isValidEdgeType(edgeData.type) ? edgeData.type : 'imports',
      weight: typeof edgeData.weight === 'number' ? edgeData.weight : 5,
    };
    graph.edges.push(edge);
  }

  return graph;
}

/**
 * Calculates how many nodes are reachable downstream from the given node.
 * Uses BFS following directed edges (source -> target).
 * Returns a normalized score from 0 to 10.
 *
 * Score formula: (reachableCount / (totalNodes - 1)) * 10
 * A node that can reach every other node scores 10.
 * A leaf node with no outgoing edges scores 0.
 *
 * Algorithm: O(V + E) -- standard BFS.
 */
export function getImpactScore(graph: DependencyGraph, nodeId: string): number {
  if (!graph.nodes.has(nodeId)) return 0;

  const totalNodes = graph.nodes.size;
  if (totalNodes <= 1) return 0;

  // Build directed adjacency list (source -> [targets])
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!adjacency.has(edge.source)) {
      adjacency.set(edge.source, []);
    }
    adjacency.get(edge.source)!.push(edge.target);
  }

  // BFS from nodeId
  const visited = new Set<string>();
  const queue: string[] = [nodeId];
  visited.add(nodeId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = adjacency.get(current) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  // Reachable count excludes the start node itself
  const reachableCount = visited.size - 1;

  // Normalize to 0-10 scale
  const score = (reachableCount / (totalNodes - 1)) * 10;
  return Math.round(score * 10) / 10; // Round to 1 decimal place
}

export function getCentrality(_graph: DependencyGraph, _nodeId: string): number {
  // TODO: Implement in Phase 5
  return 0;
}

export function getBottlenecks(_graph: DependencyGraph): string[] {
  // TODO: Implement in Phase 5
  return [];
}

export function getCluster(_graph: DependencyGraph, _nodeId: string): string[] {
  // TODO: Implement in Phase 5
  return [];
}

/**
 * Returns node IDs with zero in-degree (no incoming edges).
 * Entry points are files that nothing else depends on -- typically main/index files,
 * CLI entry points, or test files.
 *
 * Algorithm: O(E) -- iterate all edges to build in-degree counts,
 * then return nodes with count 0.
 */
export function getEntryPoints(graph: DependencyGraph): string[] {
  // Build in-degree map (all nodes start at 0)
  const inDegree = new Map<string, number>();
  for (const nodeId of graph.nodes.keys()) {
    inDegree.set(nodeId, 0);
  }

  // Count incoming edges for each target
  for (const edge of graph.edges) {
    const current = inDegree.get(edge.target) ?? 0;
    inDegree.set(edge.target, current + 1);
  }

  // Collect nodes with zero in-degree
  const entryPoints: string[] = [];
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      entryPoints.push(nodeId);
    }
  }

  return entryPoints;
}
