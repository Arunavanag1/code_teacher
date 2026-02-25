/**
 * Main analysis orchestrator command
 * Coordinates file discovery, chunking, agent execution, and output rendering.
 */

import { resolve } from 'node:path';
import { loadConfig } from '../../config/schema.js';
import type { Config } from '../../config/defaults.js';
import { providerDefaults, detectProvider } from '../../providers/index.js';
import type { DetectedProvider } from '../../providers/index.js';

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
  // Load config from the target project path
  const config = loadConfig(path);

  // Detect provider once — CLI flag > CODE_TEACHER_PROVIDER env > config file > API key auto-detect
  const detected = detectProvider(options.provider, options.model, config.provider, config.model);

  // Merge CLI options over config values (CLI wins), passing the detected provider
  const resolved = mergeConfig(config, options, path, detected);

  // Print provider detection line per spec
  if (detected) {
    console.log(
      `Using ${detected.provider} (${detected.model}) \u2014 detected from ${detected.source}`,
    );
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

  console.log('');
  console.log('Analysis engine not yet implemented \u2014 coming in later phases.');
}

// Re-export providerDefaults for callers that need the model map
export { providerDefaults };
