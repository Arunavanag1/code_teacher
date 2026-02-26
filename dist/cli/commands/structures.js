/**
 * Data structure decisions command
 * Runs analysis in structures-only mode to surface key data structure
 * choices and their trade-offs.
 */
import { analyzeCommand } from './analyze.js';
/**
 * Runs the analyze command with mode forced to 'structures'.
 * Delegates entirely to analyzeCommand -- this is a convenience shortcut.
 */
export async function runStructures(path, options) {
    await analyzeCommand(path, { ...options, mode: 'structures' });
}
//# sourceMappingURL=structures.js.map