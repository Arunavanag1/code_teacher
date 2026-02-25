/**
 * Context builder
 * Builds file/project context windows for agents, managing token budgets
 * and prioritizing content (full -> summarized -> names only).
 */

import type { FileInfo } from '../core/file-discovery.js';
import type { Chunk } from '../core/chunker.js';

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/**
 * Model context window sizes (in tokens).
 * Character heuristic: ~4 chars per token for code (widely cited, ±10-15% error).
 * Conservative fallback: 128_000 for unknown models.
 * No external tokenizer library — accuracy gain does not justify dependency cost.
 */
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // Anthropic
  'claude-sonnet-4-6': 200_000,
  'claude-opus-4-6': 200_000,
  'claude-haiku-4-5-20251001': 200_000,
  // OpenAI
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  // Google
  'gemini-2.0-flash': 1_048_576,
  'gemini-2.5-flash': 1_048_576,
};

const DEFAULT_CONTEXT_LIMIT = 128_000; // Conservative fallback for unknown models

/**
 * Estimates token count using the 4-chars-per-token heuristic.
 * Sufficient for context window management decisions — errors of ±15% do not
 * affect correctness, only the efficiency of how much content fits.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Returns the context window size for a given model name.
 * Falls back to DEFAULT_CONTEXT_LIMIT for unknown models.
 */
export function getContextLimit(model: string): number {
  return MODEL_CONTEXT_LIMITS[model] ?? DEFAULT_CONTEXT_LIMIT;
}

// ---------------------------------------------------------------------------
// Project structure tree
// ---------------------------------------------------------------------------

/**
 * Tree node: Map entries represent directories (value = TreeNode),
 * null entries represent files (value = null).
 */
type TreeNode = Map<string, TreeNode | null>;

/**
 * Builds a nested tree structure from a flat list of relative path strings.
 * Each segment of the path is a key in the nested Map.
 */
function buildTreeNode(paths: string[]): TreeNode {
  const root: TreeNode = new Map();
  for (const p of paths) {
    const parts = p.split('/');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        // Leaf node: file
        current.set(part, null);
      } else {
        // Interior node: directory
        if (!current.has(part)) {
          current.set(part, new Map());
        }
        // Safe cast: we just set it to a Map above
        current = current.get(part) as TreeNode;
      }
    }
  }
  return root;
}

/**
 * Recursively renders a TreeNode to string using box-drawing characters.
 * Directories get a trailing slash; files do not.
 */
function renderTree(node: TreeNode, prefix: string): string {
  const entries = [...node.entries()];
  const lines: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const [name, child] = entries[i];
    const isLast = i === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';

    if (child === null) {
      // File
      lines.push(prefix + connector + name);
    } else {
      // Directory
      lines.push(prefix + connector + name + '/');
      const subtree = renderTree(child, prefix + childPrefix);
      if (subtree) {
        lines.push(subtree);
      }
    }
  }
  return lines.join('\n');
}

/**
 * Builds a tree string (like the `tree` command) from a list of FileInfo objects.
 * Paths are made relative to projectPath before building the tree.
 *
 * Example output:
 *   my-project/
 *   ├── src/
 *   │   └── index.ts
 *   └── package.json
 */
export function buildProjectTree(files: FileInfo[], projectPath: string): string {
  // Normalize projectPath to not have trailing slash
  const normalizedBase = projectPath.endsWith('/') ? projectPath.slice(0, -1) : projectPath;

  const relativePaths = files.map((f) => {
    const rel = f.path.startsWith(normalizedBase + '/')
      ? f.path.slice(normalizedBase.length + 1)
      : f.path;
    return rel;
  });

  const tree = buildTreeNode(relativePaths);
  const projectName = normalizedBase.split('/').pop() ?? 'project';
  const treeBody = renderTree(tree, '');
  return treeBody ? projectName + '/\n' + treeBody : projectName + '/';
}

// ---------------------------------------------------------------------------
// Context builder
// ---------------------------------------------------------------------------

/**
 * Options for assembling a context window string.
 * systemPromptTokens is subtracted from the budget before file content is added.
 */
export interface ContextBuildOptions {
  files: FileInfo[];
  chunks: Map<string, Chunk[]>; // filePath (absolute) → chunks for that file
  projectPath: string; // Absolute path to project root
  model: string; // Model name for context limit lookup
  importMap?: Record<string, string[]>; // filePath → imported paths (optional, from prior agents)
  systemPromptTokens?: number; // Tokens already consumed by the system prompt
}

/**
 * Assembles file content, project structure, and import maps into a single
 * formatted string ready to use as the user prompt's context section.
 *
 * Priority-based truncation (per spec):
 *   1. Full content — included when file fits in remaining budget
 *   2. Summarized — first 20 lines + "... (N lines omitted)" when full doesn't fit
 *   3. Names only — just the file path when even the summary doesn't fit
 *   4. Omitted — skipped entirely when even the header doesn't fit
 *
 * Token budget: 80% of model context limit minus systemPromptTokens.
 * The 80% cap reserves space for system prompt and output tokens.
 * Files are processed in the order returned by discoverFiles() — importance
 * ordering is Phase 5's responsibility; Phase 4 fills the budget greedily.
 */
export function buildContext(options: ContextBuildOptions): string {
  const { files, chunks, projectPath, importMap, model } = options;

  const contextLimit = getContextLimit(model);
  // Reserve 20% for system prompt + output buffer (intentionally conservative)
  const contentBudget = Math.floor(contextLimit * 0.8);
  const systemTokensUsed = options.systemPromptTokens ?? 0;
  let remainingBudget = contentBudget - systemTokensUsed;

  const parts: string[] = [];

  // 1. Always include project tree (small, always fits before any file content)
  const tree = buildProjectTree(files, projectPath);
  const treeSection = 'PROJECT STRUCTURE:\n' + tree;
  const treeTokens = estimateTokens(treeSection);
  if (treeTokens <= remainingBudget) {
    parts.push(treeSection);
    remainingBudget -= treeTokens;
  }

  // 2. Include import map if available (placed between tree and file content)
  if (importMap) {
    const mapStr = JSON.stringify(importMap, null, 2);
    const mapSection = 'DEPENDENCY MAP:\n' + mapStr;
    const mapTokens = estimateTokens(mapSection);
    if (mapTokens <= remainingBudget) {
      parts.push(mapSection);
      remainingBudget -= mapTokens;
    }
  }

  // Normalize projectPath for header generation
  const normalizedBase = projectPath.endsWith('/') ? projectPath.slice(0, -1) : projectPath;

  // 3. Add file content at the highest affordable level for each file
  for (const file of files) {
    // Derive relative path for the header label
    const relPath = file.path.startsWith(normalizedBase + '/')
      ? file.path.slice(normalizedBase.length + 1)
      : file.path;
    const header = `FILE: ${relPath}`;

    // Reconstruct full content from chunks (join all chunks for the file)
    const fileChunks = chunks.get(file.path) ?? [];
    const fullContent = fileChunks.map((c) => c.content).join('\n');

    // --- Level 1: Full content ---
    const fullSection = header + '\n' + fullContent;
    const fullTokens = estimateTokens(fullSection);
    if (fullTokens <= remainingBudget) {
      parts.push(fullSection);
      remainingBudget -= fullTokens;
      continue;
    }

    // --- Level 2: Summarized (first 20 lines) ---
    const allLines = fullContent.split('\n');
    const totalLines = allLines.length;
    const firstLines = allLines.slice(0, 20).join('\n');
    const omittedCount = totalLines - 20;
    const summary =
      omittedCount > 0 ? firstLines + `\n... (${omittedCount} lines omitted)` : firstLines;
    const summarySection = header + '\n' + summary;
    const summaryTokens = estimateTokens(summarySection);
    if (summaryTokens <= remainingBudget) {
      parts.push(summarySection);
      remainingBudget -= summaryTokens;
      continue;
    }

    // --- Level 3: Names only ---
    const nameSection = header + ' (content omitted \u2014 token budget exhausted)';
    const nameTokens = estimateTokens(nameSection);
    if (nameTokens <= remainingBudget) {
      parts.push(nameSection);
      remainingBudget -= nameTokens;
    }
    // Level 4: If even the header doesn't fit, skip the file entirely (no action needed)
  }

  return parts.join('\n\n');
}
