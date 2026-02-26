/**
 * Renders analysis results to stdout.
 * Supports summary (default), verbose, and JSON output modes.
 * Consumes AgentResult arrays and uses formatter.ts for visual styling.
 */
import type { AgentResult } from '../../agents/runner.js';
import type { FileInfo } from '../../core/file-discovery.js';
import type { ResolvedConfig } from '../commands/analyze.js';
/**
 * Main entry point for rendering analysis results to stdout.
 * Routes to the appropriate output mode based on resolved config.
 *
 * @param allResults - Array of AgentResult from all agents (Stage 1 + Stage 2)
 * @param files - FileInfo array from file discovery (for file count, languages)
 * @param resolved - Resolved configuration (for mode, topN, json, verbose flags)
 * @param durationSec - Total analysis duration in seconds
 */
export declare function renderResults(allResults: AgentResult[], files: FileInfo[], resolved: ResolvedConfig, durationSec: number): void;
//# sourceMappingURL=renderer.d.ts.map