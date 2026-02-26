/**
 * Init command
 * Creates a starter code-teacher.config.json in the specified directory.
 * Refuses to overwrite an existing config unless --force is passed.
 */
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
/**
 * Starter configuration template.
 * Provider and model are intentionally omitted — they default to auto-detection,
 * and including them would confuse users who don't need to override.
 */
const STARTER_CONFIG = {
    ignore: [
        'node_modules',
        'dist',
        'build',
        '.git',
        '__pycache__',
        '*.min.js',
        '*.min.css',
        '*.lock',
        'package-lock.json',
        'yarn.lock',
        '*.png',
        '*.jpg',
        '*.gif',
        '*.svg',
        '*.ico',
        '*.woff',
        '*.woff2',
        '*.ttf',
        '*.eot',
    ],
    maxFileSize: 50000,
    topN: 5,
    customAgents: [],
};
/**
 * Init command handler.
 * Creates a starter code-teacher.config.json in the target directory.
 *
 * @param targetPath - Directory to create the config in (default: current directory)
 * @param options - Command options (--force to overwrite)
 */
export async function initCommand(targetPath, options) {
    const resolvedPath = resolve(targetPath);
    const configPath = join(resolvedPath, 'code-teacher.config.json');
    // Check if config already exists
    if (existsSync(configPath) && !options.force) {
        console.log('code-teacher.config.json already exists. Use --force to overwrite.');
        return;
    }
    // Write the starter config
    const configJson = JSON.stringify(STARTER_CONFIG, null, 2) + '\n';
    await writeFile(configPath, configJson, 'utf-8');
    // Print success message with field explanations
    console.log('Created code-teacher.config.json');
    console.log('');
    console.log('Configuration fields:');
    console.log('  ignore        - File/directory patterns to skip during analysis');
    console.log('  maxFileSize   - Maximum file size in bytes (files larger are skipped)');
    console.log('  topN          - Number of top results to display per category');
    console.log('  customAgents  - Paths to custom agent .md files (relative to project root)');
    console.log('');
    console.log('Optional fields (add manually if needed):');
    console.log('  provider      - LLM provider override: "anthropic", "openai", or "google"');
    console.log('  model         - Specific model name override');
}
//# sourceMappingURL=init.js.map