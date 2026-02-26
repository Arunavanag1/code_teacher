/**
 * Data structure decisions command
 * Runs analysis in structures-only mode to surface key data structure
 * choices and their trade-offs.
 */
import type { AnalyzeOptions } from './analyze.js';
/**
 * Runs the analyze command with mode forced to 'structures'.
 * Delegates entirely to analyzeCommand -- this is a convenience shortcut.
 */
export declare function runStructures(path: string, options: AnalyzeOptions): Promise<void>;
//# sourceMappingURL=structures.d.ts.map