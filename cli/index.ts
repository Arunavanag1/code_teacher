#!/usr/bin/env node

/**
 * code-teacher CLI entry point
 * Analyzes codebases to surface teachable sections, high-impact sections,
 * and data structure decisions.
 */

import { Command } from 'commander';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyzeCommand } from './commands/analyze.js';
import type { AnalyzeOptions } from './commands/analyze.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const require = createRequire(import.meta.url);
const pkg = require(join(__dirname, '..', '..', 'package.json')) as { version: string };

const program = new Command();

program
  .name('code-teacher')
  .description(
    'Analyzes codebases to surface teachable sections, high-impact sections, and data structure decisions',
  )
  .version(pkg.version, '-V, --version', 'output the current version');

program
  .command('analyze')
  .description('Analyze a codebase for teachable and high-impact sections')
  .argument('[path]', 'path to the project to analyze', '.')
  .option('--mode <mode>', "analysis mode: 'teachings', 'sections', or 'all'", 'all')
  .option('--file <path>', 'analyze a specific file instead of full project')
  .option('--verbose', 'show agent reasoning traces', false)
  .option('--top <n>', 'number of top results to show', '5')
  .option('--json', 'output raw JSON instead of formatted terminal output', false)
  .option('--provider <name>', "LLM provider: 'anthropic', 'openai', or 'google'")
  .option('--model <name>', 'specific model to use')
  .action(async (path: string, options: AnalyzeOptions) => {
    await analyzeCommand(path, options);
  });

program.on('command:*', (operands: string[]) => {
  console.error(`error: unknown command '${operands[0]}'`);
  console.error("Run 'code-teacher --help' to see available commands.");
  process.exitCode = 1;
});

program.parse();
