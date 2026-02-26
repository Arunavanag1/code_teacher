/**
 * @important-teachings command
 * Runs analysis in teachings-only mode to surface code sections
 * valuable for learning.
 */
import { analyzeCommand } from './analyze.js';
/**
 * Runs the analyze command with mode forced to 'teachings'.
 * Delegates entirely to analyzeCommand — this is a convenience shortcut.
 */
export async function runTeachings(path, options) {
    await analyzeCommand(path, { ...options, mode: 'teachings' });
}
//# sourceMappingURL=teachings.js.map