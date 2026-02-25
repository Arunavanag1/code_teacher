/**
 * Main analysis orchestrator command
 * Coordinates file discovery, chunking, agent execution, and output rendering.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadConfig } from '../../config/schema.js';
import type { Config } from '../../config/defaults.js';
import { providerDefaults, detectProvider, createProvider } from '../../providers/index.js';
import type { DetectedProvider } from '../../providers/index.js';
import { discoverFiles } from '../../core/file-discovery.js';
import { chunkFile } from '../../core/chunker.js';
import type { Chunk } from '../../core/chunker.js';
import { runAgent, getBuiltInAgentPaths } from '../../agents/runner.js';
import type { AgentResult } from '../../agents/runner.js';
import { renderResults } from '../output/renderer.js';
import {
  computeCommitHash,
  computeProjectContentHash,
  computeAgentVersion,
  computeCacheKey,
  getCached,
  setCached,
  getProjectCacheDir,
} from '../../core/cache.js';

/**
 * CLI options passed from commander to the analyze command.
 * Fields are optional when no default is set in commander,
 * so undefined means "not provided by the user".
 */
export interface AnalyzeOptions {
  mode?: string;
  file?: string;
  verbose?: true;
  top?: string;
  json?: true;
  provider?: string;
  model?: string;
}

/**
 * Resolved configuration combining config file values and CLI flag overrides.
 */
export interface ResolvedConfig {
  targetPath: string;
  mode: string;
  file: string | undefined;
  verbose: boolean;
  topN: number;
  json: boolean;
  provider: string | undefined;
  model: string | undefined;
  ignore: string[];
  maxFileSize: number;
  customAgents: string[];
}

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
function mergeConfig(
  config: Config,
  options: AnalyzeOptions,
  targetPath: string,
  detected: DetectedProvider | undefined,
): ResolvedConfig {
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
export async function analyzeCommand(path: string, options: AnalyzeOptions): Promise<void> {
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
      console.log(
        `Using ${detected.provider} (${detected.model}) \u2014 detected from ${detected.source}`,
      );
    }
  } else {
    console.log(
      'No LLM provider detected. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or use --provider to configure.',
    );
  }

  // Print resolved config as confirmation (actual analysis comes in later phases)
  if (resolved.json) {
    console.log(JSON.stringify(resolved, null, 2));
  } else {
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

  // Exit early if no provider detected
  if (!detected) {
    console.log(
      'No LLM provider detected. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or use --provider to configure.',
    );
    return;
  }

  // Create the LLM provider instance
  const provider = createProvider(detected.provider, detected.model);

  // Discover files in the target project
  console.log('');
  console.log('Discovering files...');
  const files = await discoverFiles(resolved.targetPath, resolved.ignore, resolved.maxFileSize);

  if (files.length === 0) {
    console.log('No analyzable files found. Check your ignore patterns.');
    return;
  }

  console.log(`Found ${files.length} file(s). Chunking...`);

  // Chunk all discovered files
  const chunks = new Map<string, Chunk[]>();
  for (const file of files) {
    const content = await readFile(file.path, 'utf-8');
    chunks.set(file.path, chunkFile(content, file.path));
  }

  // Resolve built-in agent paths
  const agentPaths = getBuiltInAgentPaths();
  // Add any custom agents from config
  const allAgentPaths = [...agentPaths, ...resolved.customAgents.map((p) => resolve(p))];

  if (!resolved.json) {
    console.log(`Running ${allAgentPaths.length} agent(s)...`);
  }

  // Compute cache key from project state + agent definitions
  const commitHash = computeCommitHash(resolved.targetPath);
  const contentHash = await computeProjectContentHash(files);

  // Compute combined agent version hash (hash of all agent file hashes)
  const agentHashes: string[] = [];
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
      console.log('');
    }
    const durationSec = (Date.now() - startTime) / 1000;
    const cachedResults = cached as AgentResult[];
    if (resolved.json) {
      console.log(JSON.stringify(cachedResults, null, 2));
    } else {
      for (const result of cachedResults) {
        console.log(`Agent: ${result.agentName}`);
        console.log(`Output keys: ${Object.keys(result.output).join(', ')}`);
        console.log('');
      }
      console.log(
        `Analysis complete (cached). ${cachedResults.length} agents. ${durationSec.toFixed(1)}s`,
      );
    }
    return;
  }

  if (!resolved.json) {
    console.log('Cache miss \u2014 running analysis...');
    console.log('');
  }

  // Run all Stage 1 agents in parallel (dependency mapper, teachability scorer, structure analyzer)
  const stage1Paths = allAgentPaths.slice(0, 3); // dependency-mapper, teachability-scorer, structure-analyzer
  const stage1Results = await Promise.all(
    stage1Paths.map((agentPath) =>
      runAgent({
        agentPath,
        files,
        chunks,
        projectPath: resolved.targetPath,
        provider,
        model: detected.model,
      }),
    ),
  );

  // Print results summary
  for (const result of stage1Results) {
    console.log(`Agent: ${result.agentName}`);
    console.log(
      `Tokens: ${result.tokenUsage.inputTokens} in / ${result.tokenUsage.outputTokens} out`,
    );
    if (resolved.verbose) {
      console.log('Raw output:');
      console.log(result.rawContent);
    }
    if (resolved.json) {
      console.log(JSON.stringify(result.output, null, 2));
    } else {
      console.log(`Output keys: ${Object.keys(result.output).join(', ')}`);
    }
    console.log('');
  }

  // Stage 2: Run impact ranker sequentially — receives all Stage 1 outputs
  console.log('Running Stage 2 (Impact Ranker)...');
  const stage2Path = allAgentPaths[3]; // impact-ranker.md is the 4th built-in agent
  const stage2Result = await runAgent({
    agentPath: stage2Path,
    files,
    chunks,
    projectPath: resolved.targetPath,
    provider,
    model: detected.model,
    stage1Outputs: stage1Results,
  });

  // Print Stage 2 result
  console.log(`Agent: ${stage2Result.agentName}`);
  console.log(
    `Tokens: ${stage2Result.tokenUsage.inputTokens} in / ${stage2Result.tokenUsage.outputTokens} out`,
  );
  if (resolved.verbose) {
    console.log('Raw output:');
    console.log(stage2Result.rawContent);
  }
  if (resolved.json) {
    console.log(JSON.stringify(stage2Result.output, null, 2));
  } else {
    console.log(`Output keys: ${Object.keys(stage2Result.output).join(', ')}`);
  }
  console.log('');

  // Collect all results for Phase 6 rendering
  const allResults = [...stage1Results, stage2Result];

  // Cache the results for future runs
  await setCached(cacheKey, allResults, cacheDir);

  console.log(
    `Analysis complete. ${allResults.length} agents produced results. Full rendering coming in Phase 6.`,
  );
}

// Re-export providerDefaults for callers that need the model map
export { providerDefaults };
