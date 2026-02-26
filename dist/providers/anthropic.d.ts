import type { LLMProvider, CallOptions, LLMResponse } from './index.js';
export declare class AnthropicProvider implements LLMProvider {
    readonly name = "anthropic";
    private client;
    private model;
    constructor(apiKey: string, model: string);
    call(systemPrompt: string, userPrompt: string, options?: CallOptions): Promise<LLMResponse>;
}
//# sourceMappingURL=anthropic.d.ts.map