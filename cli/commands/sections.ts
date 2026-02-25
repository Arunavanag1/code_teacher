/**
 * @important-sections command
 * Runs analysis in sections-only mode to surface high-impact,
 * dependency-heavy code sections.
 */

import { analyzeCommand } from './analyze.js';
import type { AnalyzeOptions } from './analyze.js';

/**
 * Runs the analyze command with mode forced to 'sections'.
 * Delegates entirely to analyzeCommand — this is a convenience shortcut.
 */
export async function runSections(path: string, options: AnalyzeOptions): Promise<void> {
  await analyzeCommand(path, { ...options, mode: 'sections' });
}
