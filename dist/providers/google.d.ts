import type { LLMProvider, CallOptions, LLMResponse } from './index.js';
export declare class GoogleProvider implements LLMProvider {
    readonly name = "google";
    private ai;
    private model;
    constructor(apiKey: string, model: string);
    call(systemPrompt: string, userPrompt: string, options?: CallOptions): Promise<LLMResponse>;
}
//# sourceMappingURL=google.d.ts.map