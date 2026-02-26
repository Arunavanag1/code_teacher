/**
 * @important-sections command
 * Runs analysis in sections-only mode to surface high-impact,
 * dependency-heavy code sections.
 */
import type { AnalyzeOptions } from './analyze.js';
/**
 * Runs the analyze command with mode forced to 'sections'.
 * Delegates entirely to analyzeCommand — this is a convenience shortcut.
 */
export declare function runSections(path: string, options: AnalyzeOptions): Promise<void>;
//# sourceMappingURL=sections.d.ts.map