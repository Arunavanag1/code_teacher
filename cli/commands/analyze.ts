/**
 * Main analysis orchestrator command
 * Coordinates file discovery, chunking, agent execution, and output rendering.
 */

import { resolve } from 'node:path';
import { loadConfig } from '../../config/schema.js';
import type { Config } from '../../config/defaults.js';

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
 * Default models for each known provider.
 */
const providerDefaults: Record<string, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  google: 'gemini-pro',
};

/**
 * Auto-detects the LLM provider from environment variables.
 * Detection order per spec:
 *   1. CODE_TEACHER_PROVIDER / CODE_TEACHER_MODEL env vars
 *   2. ANTHROPIC_API_KEY -> Anthropic
 *   3. OPENAI_API_KEY -> OpenAI
 *   4. GOOGLE_API_KEY -> Google
 */
function autoDetectProvider(): { provider: string; model: string; source: string } | undefined {
  if (process.env.CODE_TEACHER_PROVIDER) {
    const provider = process.env.CODE_TEACHER_PROVIDER;
    const model = process.env.CODE_TEACHER_MODEL ?? providerDefaults[provider] ?? 'default';
    return { provider, model, source: 'CODE_TEACHER_PROVIDER env' };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: 'anthropic',
      model: providerDefaults.anthropic,
      source: 'ANTHROPIC_API_KEY',
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: 'openai', model: providerDefaults.openai, source: 'OPENAI_API_KEY' };
  }
  if (process.env.GOOGLE_API_KEY) {
    return { provider: 'google', model: providerDefaults.google, source: 'GOOGLE_API_KEY' };
  }
  return undefined;
}

/**
 * Determines the source of the provider setting for the startup message.
 */
function detectProviderSource(
  cliProvider: string | undefined,
  configProvider: string | undefined,
): string {
  if (cliProvider) return 'CLI flag';
  if (configProvider) return 'config file';
  const autoDetected = autoDetectProvider();
  return autoDetected?.source ?? 'none';
}

/**
 * Merges CLI options over loaded config values. CLI flags always win.
 * Resolution order: CLI flag > config file > env auto-detection > hardcoded defaults
 *
 * When a CLI option is undefined, it means the user did not pass that flag,
 * so we fall through to config file value, then to hardcoded defaults.
 */
function mergeConfig(config: Config, options: AnalyzeOptions, targetPath: string): ResolvedConfig {
  const autoDetected = autoDetectProvider();

  const provider = options.provider ?? config.provider ?? autoDetected?.provider;
  const model = options.model ?? config.model ?? autoDetected?.model;

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

  // Merge CLI options over config values (CLI wins)
  const resolved = mergeConfig(config, options, path);

  // Detect source for the provider startup message
  const source = detectProviderSource(options.provider, config.provider);

  // Print provider detection line per spec
  if (resolved.provider) {
    console.log(
      `Using ${resolved.provider} (${resolved.model ?? 'default'}) \u2014 detected from ${source}`,
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
