/**
 * Ollama provider
 * Uses the OpenAI-compatible API exposed by Ollama at localhost:11434/v1.
 * Reuses the existing `openai` npm package — no additional dependencies.
 * No API key required for local inference.
 */
import type { LLMProvider, CallOptions, LLMResponse } from './index.js';
export declare class OllamaProvider implements LLMProvider {
    readonly name = "ollama";
    private client;
    private model;
    constructor(model: string, baseURL?: string);
    call(systemPrompt: string, userPrompt: string, options?: CallOptions): Promise<LLMResponse>;
}
//# sourceMappingURL=ollama.d.ts.map