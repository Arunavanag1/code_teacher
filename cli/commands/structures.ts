/**
 * Data structure decisions command
 * Runs analysis in structures-only mode to surface key data structure
 * choices and their trade-offs.
 */

import { analyzeCommand } from './analyze.js';
import type { AnalyzeOptions } from './analyze.js';

/**
 * Runs the analyze command with mode forced to 'structures'.
 * Delegates entirely to analyzeCommand -- this is a convenience shortcut.
 */
export async function runStructures(path: string, options: AnalyzeOptions): Promise<void> {
  await analyzeCommand(path, { ...options, mode: 'structures' });
}
