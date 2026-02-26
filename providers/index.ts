/**
 * LLM Provider abstraction layer.
 *
 * Defines the spec-exact interfaces (LLMProvider, CallOptions, LLMResponse),
 * the canonical provider defaults map, detection logic, and a factory function
 * that instantiates concrete provider implementations.
 *
 * Detection order per spec:
 *   1. CLI --provider flag (highest priority)
 *   2. CODE_TEACHER_PROVIDER env var
 *   3. Config file provider setting
 *   4. Auto-detect from API keys: ANTHROPIC_API_KEY → OPENAI_API_KEY → GOOGLE_API_KEY
 *   5. No provider found (returns undefined)
 */

import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import { GoogleProvider } from './google.js';
import { OllamaProvider } from './ollama.js';

// ---------------------------------------------------------------------------
// Spec-exact interfaces
// ---------------------------------------------------------------------------

/**
 * Unified LLM provider interface. All providers implement this interface.
 * The name field stores lowercase canonical names: "anthropic", "openai", "google".
 */
export interface LLMProvider {
  name: string;
  call(systemPrompt: string, userPrompt: string, options?: CallOptions): Promise<LLMResponse>;
}

/**
 * Options for a single LLM call.
 * temperature defaults to 0.2 for analytical consistency per spec.
 * responseFormat: "json" forces JSON output where supported by the provider.
 */
export interface CallOptions {
  maxTokens?: number;
  temperature?: number; // Default: 0.2 for analytical consistency
  responseFormat?: 'json'; // Force JSON output where supported
}

/**
 * Normalized response from any LLM provider.
 * usage.inputTokens and usage.outputTokens use camelCase regardless of SDK field names.
 * model reflects the actual model string used in the call.
 */
export interface LLMResponse {
  content: string;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
}

// ---------------------------------------------------------------------------
// Provider defaults
// ---------------------------------------------------------------------------

/**
 * Canonical default model names for each supported provider.
 * Updated to current model names as of February 2026.
 */
export const providerDefaults: Record<string, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  google: 'gemini-2.0-flash',
  ollama: 'llama3.1',
};

// ---------------------------------------------------------------------------
// API key env var map (internal)
// ---------------------------------------------------------------------------

/**
 * Maps provider names to the env var that holds their API key.
 * Used by both detectProvider (auto-detection) and createProvider (validation).
 */
const providerApiKeyEnvVars: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
};

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

/**
 * Thrown when provider detection or factory validation fails.
 * Examples: no API key found, unknown provider name, provider selected but key missing.
 */
export class ProviderDetectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderDetectionError';
  }
}

// ---------------------------------------------------------------------------
// Detection result type
// ---------------------------------------------------------------------------

/**
 * The result of detectProvider() — the resolved provider, model, and the
 * source that caused the selection (for the startup message).
 */
export interface DetectedProvider {
  provider: string;
  model: string;
  source: string;
}

// ---------------------------------------------------------------------------
// Detection function
// ---------------------------------------------------------------------------

/**
 * Resolves which LLM provider to use by following the spec detection order:
 *   1. cliProvider (--provider flag) — highest priority
 *   2. CODE_TEACHER_PROVIDER env var
 *   3. configProvider (config file setting)
 *   4. Auto-detect from API keys: ANTHROPIC_API_KEY → OPENAI_API_KEY → GOOGLE_API_KEY
 *
 * Returns undefined if no provider can be determined.
 * The source field describes where the provider was detected from (for startup messages).
 */
export function detectProvider(
  cliProvider?: string,
  cliModel?: string,
  configProvider?: string,
  configModel?: string,
): DetectedProvider | undefined {
  // 1. CLI --provider flag (highest priority)
  if (cliProvider) {
    const model = cliModel ?? configModel ?? providerDefaults[cliProvider] ?? 'default';
    return { provider: cliProvider, model, source: 'CLI flag' };
  }

  // 2. CODE_TEACHER_PROVIDER env var
  if (process.env.CODE_TEACHER_PROVIDER) {
    const provider = process.env.CODE_TEACHER_PROVIDER;
    const model =
      cliModel ??
      process.env.CODE_TEACHER_MODEL ??
      configModel ??
      providerDefaults[provider] ??
      'default';
    return { provider, model, source: 'CODE_TEACHER_PROVIDER env' };
  }

  // 3. Config file provider
  if (configProvider) {
    const model = cliModel ?? configModel ?? providerDefaults[configProvider] ?? 'default';
    return { provider: configProvider, model, source: 'config file' };
  }

  // 4. Auto-detect from API keys in spec priority order
  if (process.env.ANTHROPIC_API_KEY) {
    const model = cliModel ?? providerDefaults.anthropic;
    return { provider: 'anthropic', model, source: 'ANTHROPIC_API_KEY' };
  }
  if (process.env.OPENAI_API_KEY) {
    const model = cliModel ?? providerDefaults.openai;
    return { provider: 'openai', model, source: 'OPENAI_API_KEY' };
  }
  if (process.env.GOOGLE_API_KEY) {
    const model = cliModel ?? providerDefaults.google;
    return { provider: 'google', model, source: 'GOOGLE_API_KEY' };
  }

  // 5. No provider found
  return undefined;
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Instantiates the LLMProvider for the given provider name and model.
 *
 * Validates that the provider is known and that the required API key env var
 * is set before attempting to construct the provider. Throws ProviderDetectionError
 * with a clear message if either check fails.
 */
export function createProvider(
  providerName: string,
  model: string,
  ollamaUrl?: string,
): LLMProvider {
  // Ollama doesn't require an API key
  if (providerName === 'ollama') {
    return new OllamaProvider(model, ollamaUrl);
  }

  const envVarName = providerApiKeyEnvVars[providerName];

  if (!envVarName) {
    throw new ProviderDetectionError(
      `Unknown provider '${providerName}'. Supported providers: anthropic, openai, google, ollama.`,
    );
  }

  const apiKey = process.env[envVarName];
  if (!apiKey) {
    throw new ProviderDetectionError(
      `Provider '${providerName}' selected but ${envVarName} is not set.`,
    );
  }

  switch (providerName) {
    case 'anthropic':
      return new AnthropicProvider(apiKey, model);
    case 'openai':
      return new OpenAIProvider(apiKey, model);
    case 'google':
      return new GoogleProvider(apiKey, model);
    default:
      throw new ProviderDetectionError(
        `Unknown provider '${providerName}'. Supported providers: anthropic, openai, google, ollama.`,
      );
  }
}
