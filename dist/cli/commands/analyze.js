/**
 * Main analysis orchestrator command
 * Coordinates file discovery, chunking, agent execution, and output rendering.
 */
import { watch } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadConfig } from '../../config/schema.js';
import { providerDefaults, detectProvider, createProvider } from '../../providers/index.js';
import { discoverFiles } from '../../core/file-discovery.js';
import { chunkFile } from '../../core/chunker.js';
import { runAgent, getBuiltInAgentPaths } from '../../agents/runner.js';
import { renderResults } from '../output/renderer.js';
import { computeCommitHash, computeProjectContentHash, computeAgentVersion, computeCacheKey, getCached, setCached, getProjectCacheDir, } from '../../core/cache.js';
/**
 * Merges CLI options over loaded config values. CLI flags always win.
 * Resolution order: CLI flag > config file > env auto-detection > hardcoded defaults.
 *
 * When a CLI option is undefined, it means the user did not pass that flag,
 * so we fall through to config file value, then to hardcoded defaults.
 *
 * The detected parameter is the result of detectProvider() called before mergeConfig,
 * so detection runs only once and the source is available for the startup message.
 */
function mergeConfig(config, options, targetPath, detected) {
    const provider = detected?.provider;
    const model = detected?.model;
    // Parse --top as integer only when user explicitly passed it; otherwise use config value
    let topN = config.topN;
    if (options.top !== undefined) {
        const parsedTop = parseInt(options.top, 10);
        if (Number.isFinite(parsedTop) && parsedTop > 0) {
            topN = parsedTop;
        }
    }
    return {
        targetPath: resolve(targetPath),
        mode: options.mode ?? 'all',
        file: options.file,
        verbose: options.verbose ?? false,
        topN,
        json: options.json ?? false,
        provider,
        model,
        ignore: config.ignore,
        maxFileSize: config.maxFileSize,
        customAgents: config.customAgents,
    };
}
/**
 * Main analyze command handler.
 * Loads config from the target project path, merges with CLI flags, and prints
 * resolved configuration. Actual analysis will be implemented in later phases.
 */
export async function analyzeCommand(path, options) {
    const startTime = Date.now();
    // Load config from the target project path
    const config = loadConfig(path);
    // Detect provider once — CLI flag > CODE_TEACHER_PROVIDER env > config file > API key auto-detect
    const detected = detectProvider(options.provider, options.model, config.provider, config.model);
    // Merge CLI options over config values (CLI wins), passing the detected provider
    const resolved = mergeConfig(config, options, path, detected);
    // Print provider detection line per spec (suppressed in JSON mode for clean output)
    if (detected) {
        if (!resolved.json) {
            console.log(`Using ${detected.provider} (${detected.model}) \u2014 detected from ${detected.source}`);
        }
    }
    else {
        const hint = process.env.CLAUDECODE
            ? '\n\nTip: You\'re running inside Claude Code, which uses its own auth.\ncode-teacher needs its own API key. Run:\n  export ANTHROPIC_API_KEY="your-key-here"'
            : '';
        console.error(`No LLM provider detected. Set one of these environment variables:\n  ANTHROPIC_API_KEY\n  OPENAI_API_KEY\n  GOOGLE_API_KEY\n\nOr use --provider to configure.${hint}`);
        return;
    }
    // Print resolved config as confirmation (suppressed in JSON mode for clean output)
    if (!resolved.json) {
        console.log('');
        console.log(`Target:    ${resolved.targetPath}`);
        console.log(`Mode:      ${resolved.mode}`);
        if (resolved.file) {
            console.log(`File:      ${resolved.file}`);
        }
        console.log(`Top:       ${resolved.topN}`);
        console.log(`Verbose:   ${resolved.verbose}`);
        console.log(`JSON:      ${resolved.json}`);
        if (resolved.verbose) {
            console.log('');
            console.log('Full resolved configuration:');
            console.log(JSON.stringify(resolved, null, 2));
        }
    }
    // Create the LLM provider instance
    const provider = createProvider(detected.provider, detected.model);
    // Discover files in the target project
    if (!resolved.json) {
        console.log('');
        console.log('Discovering files...');
    }
    let files;
    try {
        files = await discoverFiles(resolved.targetPath, resolved.ignore, resolved.maxFileSize);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Cannot read directory: ${resolved.targetPath}. Check that the path exists and is accessible.`);
        if (resolved.verbose) {
            console.error(`  Detail: ${msg}`);
        }
        return;
    }
    if (files.length === 0) {
        console.log('No analyzable files found. Check your ignore patterns.');
        return;
    }
    if (!resolved.json) {
        console.log(`Found ${files.length} file(s). Chunking...`);
    }
    // Chunk all discovered files
    const chunks = new Map();
    for (const file of files) {
        try {
            const content = await readFile(file.path, 'utf-8');
            chunks.set(file.path, chunkFile(content, file.path));
        }
        catch {
            console.warn(`Warning: Skipping ${file.path} (unreadable)`);
        }
    }
    // Resolve built-in agent paths
    const agentPaths = getBuiltInAgentPaths();
    // Custom agent paths resolve relative to the project root (not process.cwd())
    const allAgentPaths = [
        ...agentPaths,
        ...resolved.customAgents.map((p) => resolve(resolved.targetPath, p)),
    ];
    if (!resolved.json) {
        console.log(`Running ${allAgentPaths.length} agent(s)...`);
    }
    // Validate custom agent files exist before running (fail fast with clear message)
    for (const customPath of resolved.customAgents) {
        const fullPath = resolve(resolved.targetPath, customPath);
        try {
            await readFile(fullPath, 'utf-8');
        }
        catch {
            console.error(`Custom agent not found: ${fullPath}. Check customAgents in your config.`);
            return;
        }
    }
    // Compute cache key from project state + agent definitions
    const commitHash = computeCommitHash(resolved.targetPath);
    const contentHash = await computeProjectContentHash(files);
    // Compute combined agent version hash (hash of all agent file hashes)
    const agentHashes = [];
    for (const agentPath of allAgentPaths) {
        agentHashes.push(await computeAgentVersion(agentPath));
    }
    const agentVersionHash = computeCacheKey('', agentHashes.join(''), '');
    const cacheKey = computeCacheKey(commitHash, contentHash, agentVersionHash);
    const cacheDir = getProjectCacheDir(resolved.targetPath);
    // Check cache
    const cached = await getCached(cacheKey, cacheDir);
    if (cached && Array.isArray(cached)) {
        if (!resolved.json) {
            console.log('Cache hit \u2014 using cached results.');
        }
        const durationSec = (Date.now() - startTime) / 1000;
        const cachedResults = cached;
        renderResults(cachedResults, files, resolved, durationSec);
        return;
    }
    if (!resolved.json) {
        console.log('Cache miss \u2014 running analysis...');
        console.log('');
    }
    // Built-in agents are indices 0-3 (mapper, scorer, analyzer, ranker)
    // Custom agents are appended after. All except impact ranker (index 3) run in Stage 1.
    const builtInCount = agentPaths.length; // 4 built-in agents
    const impactRankerPath = agentPaths[builtInCount - 1]; // Always the last built-in
    const stage1Paths = [
        ...agentPaths.slice(0, builtInCount - 1), // First 3 built-in Stage 1 agents
        ...resolved.customAgents.map((p) => resolve(resolved.targetPath, p)), // All custom agents
    ];
    const stage1Results = await Promise.all(stage1Paths.map((agentPath) => runAgent({
        agentPath,
        files,
        chunks,
        projectPath: resolved.targetPath,
        provider,
        model: detected.model,
    })));
    // Stage 2: Run impact ranker sequentially — receives all Stage 1 outputs
    if (!resolved.json) {
        console.log('Running Stage 2 (Impact Ranker)...');
    }
    const stage2Path = impactRankerPath;
    const stage2Result = await runAgent({
        agentPath: stage2Path,
        files,
        chunks,
        projectPath: resolved.targetPath,
        provider,
        model: detected.model,
        stage1Outputs: stage1Results,
    });
    // Collect all results and render output
    const allResults = [...stage1Results, stage2Result];
    // Cache the results for future runs
    await setCached(cacheKey, allResults, cacheDir);
    // Render results using the appropriate output mode
    const durationSec = (Date.now() - startTime) / 1000;
    renderResults(allResults, files, resolved, durationSec);
    // Start watch mode if --watch flag is set
    if (options.watch) {
        watchForChanges(resolved.targetPath, resolved.ignore, async () => {
            await analyzeCommand(path, { ...options, watch: undefined });
        });
    }
}
/**
 * Watches the target directory for file changes and re-runs analysis.
 * Uses fs.watch with recursive mode (Node.js 19.1+).
 * Debounces rapid file changes with a 500ms delay.
 *
 * Filters out:
 * - .code-teacher-cache/ directory (prevents infinite loops)
 * - Files matching the configured ignore patterns
 */
function watchForChanges(targetPath, ignorePatterns, reanalyze) {
    let debounceTimer = null;
    let isRunning = false;
    console.log('');
    console.log('Watching for file changes... (press Ctrl+C to stop)');
    const watcher = watch(targetPath, { recursive: true }, (_eventType, filename) => {
        if (!filename)
            return;
        // Prevent infinite loop: ignore cache directory changes
        if (filename.startsWith('.code-teacher-cache'))
            return;
        // Ignore files matching configured ignore patterns
        const shouldIgnore = ignorePatterns.some((pattern) => {
            // Simple glob matching: exact match, prefix match, or extension match
            if (filename === pattern)
                return true;
            if (filename.startsWith(pattern + '/') || filename.startsWith(pattern + '\\'))
                return true;
            // Handle glob patterns like *.min.js
            if (pattern.startsWith('*')) {
                return filename.endsWith(pattern.slice(1));
            }
            return false;
        });
        if (shouldIgnore)
            return;
        // Debounce: wait 500ms after the last event before re-analyzing
        if (debounceTimer)
            clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            if (isRunning)
                return;
            isRunning = true;
            console.log(`\nFile changed: ${filename}. Re-analyzing...`);
            reanalyze()
                .catch((err) => {
                if (err instanceof Error) {
                    console.error(`Error during re-analysis: ${err.message}`);
                }
            })
                .finally(() => {
                isRunning = false;
                console.log('\nWatching for file changes... (press Ctrl+C to stop)');
            });
        }, 500);
    });
    // Handle process termination
    process.on('SIGINT', () => {
        watcher.close();
        console.log('\nStopped watching.');
        process.exit(0);
    });
}
// Re-export providerDefaults for callers that need the model map
export { providerDefaults };
//# sourceMappingURL=analyze.js.map