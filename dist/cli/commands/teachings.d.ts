/**
 * @important-teachings command
 * Runs analysis in teachings-only mode to surface code sections
 * valuable for learning.
 */
import type { AnalyzeOptions } from './analyze.js';
/**
 * Runs the analyze command with mode forced to 'teachings'.
 * Delegates entirely to analyzeCommand — this is a convenience shortcut.
 */
export declare function runTeachings(path: string, options: AnalyzeOptions): Promise<void>;
//# sourceMappingURL=teachings.d.ts.map