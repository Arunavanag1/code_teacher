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
    temperature?: number;
    responseFormat?: 'json';
}
/**
 * Normalized response from any LLM provider.
 * usage.inputTokens and usage.outputTokens use camelCase regardless of SDK field names.
 * model reflects the actual model string used in the call.
 */
export interface LLMResponse {
    content: string;
    usage: {
        inputTokens: number;
        outputTokens: number;
    };
    model: string;
}
/**
 * Canonical default model names for each supported provider.
 * Updated to current model names as of February 2026.
 */
export declare const providerDefaults: Record<string, string>;
/**
 * Thrown when provider detection or factory validation fails.
 * Examples: no API key found, unknown provider name, provider selected but key missing.
 */
export declare class ProviderDetectionError extends Error {
    constructor(message: string);
}
/**
 * The result of detectProvider() — the resolved provider, model, and the
 * source that caused the selection (for the startup message).
 */
export interface DetectedProvider {
    provider: string;
    model: string;
    source: string;
}
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
export declare function detectProvider(cliProvider?: string, cliModel?: string, configProvider?: string, configModel?: string): DetectedProvider | undefined;
/**
 * Instantiates the LLMProvider for the given provider name and model.
 *
 * Validates that the provider is known and that the required API key env var
 * is set before attempting to construct the provider. Throws ProviderDetectionError
 * with a clear message if either check fails.
 */
export declare function createProvider(providerName: string, model: string): LLMProvider;
//# sourceMappingURL=index.d.ts.map