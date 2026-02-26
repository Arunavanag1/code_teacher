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
import { initCommand } from './commands/init.js';
import { setKeyCommand } from './commands/set-key.js';
import { runTeachings } from './commands/teachings.js';
import { runSections } from './commands/sections.js';
import { runStructures } from './commands/structures.js';
import { ConfigValidationError } from '../config/schema.js';
import { ProviderDetectionError } from '../providers/index.js';
import { injectCredentials } from '../core/credentials.js';
// Inject saved credentials from ~/.code-teacher/credentials.json
// so API keys persist across all environments (Claude Code, Codex, etc.)
injectCredentials();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const pkg = require(join(__dirname, '..', '..', 'package.json'));
const program = new Command();
program
    .name('code-teacher')
    .description('Analyzes codebases to surface teachable sections, high-impact sections, and data structure decisions')
    .version(pkg.version, '-V, --version', 'output the current version');
/**
 * Registers a focused command that runs analysis in a specific mode.
 * All three commands (teach, impact, structures) share the same flags
 * as analyze minus --mode, and the same error handling pattern.
 */
function registerFocusedCommand(name, description, handler) {
    program
        .command(name)
        .description(description)
        .argument('[path]', 'path to the project to analyze', '.')
        .option('--file <path>', 'analyze a specific file instead of full project')
        .option('--verbose', 'show agent reasoning traces')
        .option('--top <n>', 'number of top results to show (default: 5)')
        .option('--json', 'output raw JSON instead of formatted terminal output')
        .option('--provider <name>', "LLM provider: 'anthropic', 'openai', or 'google'")
        .option('--model <name>', 'specific model to use')
        .option('--watch', 'watch for file changes and re-analyze automatically')
        .action(async (path, options) => {
        try {
            await handler(path, options);
        }
        catch (err) {
            if (err instanceof ConfigValidationError) {
                console.error(`Invalid config: ${err.errors.length} error(s) found`);
                for (const e of err.errors) {
                    console.error(`  - ${e}`);
                }
            }
            else if (err instanceof ProviderDetectionError) {
                console.error(err.message);
            }
            else if (err instanceof Error) {
                console.error(`Error: ${err.message}`);
            }
            else {
                console.error('An unexpected error occurred.');
            }
            process.exitCode = 1;
        }
    });
}
program
    .command('analyze')
    .description('Analyze a codebase for teachable and high-impact sections')
    .argument('[path]', 'path to the project to analyze', '.')
    .option('--mode <mode>', "analysis mode: 'teachings', 'sections', or 'all' (default: all)")
    .option('--file <path>', 'analyze a specific file instead of full project')
    .option('--verbose', 'show agent reasoning traces')
    .option('--top <n>', 'number of top results to show (default: 5)')
    .option('--json', 'output raw JSON instead of formatted terminal output')
    .option('--provider <name>', "LLM provider: 'anthropic', 'openai', or 'google'")
    .option('--model <name>', 'specific model to use')
    .option('--watch', 'watch for file changes and re-analyze automatically')
    .action(async (path, options) => {
    try {
        await analyzeCommand(path, options);
    }
    catch (err) {
        if (err instanceof ConfigValidationError) {
            console.error(`Invalid config: ${err.errors.length} error(s) found`);
            for (const e of err.errors) {
                console.error(`  - ${e}`);
            }
        }
        else if (err instanceof ProviderDetectionError) {
            console.error(err.message);
        }
        else if (err instanceof Error) {
            console.error(`Error: ${err.message}`);
        }
        else {
            console.error('An unexpected error occurred.');
        }
        process.exitCode = 1;
    }
});
program
    .command('init')
    .description('Create a starter code-teacher.config.json in the current directory')
    .argument('[path]', 'directory to create config in', '.')
    .option('--force', 'overwrite existing config file')
    .action(async (path, options) => {
    try {
        await initCommand(path, options);
    }
    catch (err) {
        if (err instanceof Error) {
            console.error(`Error: ${err.message}`);
        }
        else {
            console.error('An unexpected error occurred.');
        }
        process.exitCode = 1;
    }
});
program
    .command('set-key')
    .description('Save an API key so code-teacher works in any environment (Claude Code, Codex, etc.)')
    .argument('<provider>', "provider name: 'anthropic', 'openai', or 'google'")
    .argument('<key>', 'your API key')
    .action(async (provider, key) => {
    await setKeyCommand(provider, key);
});
registerFocusedCommand('teach', 'Show the top teachable code sections in the codebase', runTeachings);
registerFocusedCommand('impact', 'Show the highest-impact, most-depended-on code sections', runSections);
registerFocusedCommand('structures', 'Show key data structure decisions and their trade-offs', runStructures);
program.on('command:*', (operands) => {
    console.error(`error: unknown command '${operands[0]}'`);
    console.error("Run 'code-teacher --help' to see available commands.");
    process.exitCode = 1;
});
program.parse();
//# sourceMappingURL=index.js.map