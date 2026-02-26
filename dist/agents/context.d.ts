/**
 * Context builder
 * Builds file/project context windows for agents, managing token budgets
 * and prioritizing content (full -> summarized -> names only).
 */
import type { FileInfo } from '../core/file-discovery.js';
import type { Chunk } from '../core/chunker.js';
import type { DependencyGraph } from '../core/dependency-graph.js';
/**
 * Model context window sizes (in tokens).
 * Character heuristic: ~4 chars per token for code (widely cited, ±10-15% error).
 * Conservative fallback: 128_000 for unknown models.
 * No external tokenizer library — accuracy gain does not justify dependency cost.
 */
export declare const MODEL_CONTEXT_LIMITS: Record<string, number>;
/**
 * Estimates token count using the 4-chars-per-token heuristic.
 * Sufficient for context window management decisions — errors of ±15% do not
 * affect correctness, only the efficiency of how much content fits.
 */
export declare function estimateTokens(text: string): number;
/**
 * Returns the context window size for a given model name.
 * Falls back to DEFAULT_CONTEXT_LIMIT for unknown models.
 */
export declare function getContextLimit(model: string): number;
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
export declare function buildProjectTree(files: FileInfo[], projectPath: string): string;
/**
 * Prioritizes files by importance using dependency graph metrics.
 * Sorts by a weighted score: (fanIn * 0.4) + (centrality * 0.3) + (fanOut * 0.2) + (sizeScore * 0.1)
 * Always includes entry points and high fan-in files.
 * Returns at most maxFiles files.
 */
export declare function prioritizeFiles(files: FileInfo[], projectPath: string, graph: DependencyGraph | undefined, maxFiles: number): FileInfo[];
/**
 * Options for assembling a context window string.
 * systemPromptTokens is subtracted from the budget before file content is added.
 */
export interface ContextBuildOptions {
    files: FileInfo[];
    chunks: Map<string, Chunk[]>;
    projectPath: string;
    model: string;
    importMap?: Record<string, string[]>;
    systemPromptTokens?: number;
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
export declare function buildContext(options: ContextBuildOptions): string;
//# sourceMappingURL=context.d.ts.map