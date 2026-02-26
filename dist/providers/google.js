import { GoogleGenAI } from '@google/genai';
export class GoogleProvider {
    name = 'google';
    ai;
    model;
    constructor(apiKey, model) {
        this.ai = new GoogleGenAI({ apiKey });
        this.model = model;
    }
    async call(systemPrompt, userPrompt, options) {
        const temperature = options?.temperature ?? 0.2;
        const response = await this.ai.models.generateContent({
            model: this.model,
            contents: userPrompt,
            config: {
                systemInstruction: systemPrompt,
                temperature,
                maxOutputTokens: options?.maxTokens ?? 8096,
                ...(options?.responseFormat === 'json' ? { responseMimeType: 'application/json' } : {}),
            },
        });
        return {
            content: response.text ?? '',
            usage: {
                inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
                outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
            },
            // Google response does not include the model name; use constructor value
            model: this.model,
        };
    }
}
//# sourceMappingURL=google.js.map