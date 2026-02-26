import Anthropic from '@anthropic-ai/sdk';
export class AnthropicProvider {
    name = 'anthropic';
    client;
    model;
    constructor(apiKey, model) {
        this.client = new Anthropic({ apiKey });
        this.model = model;
    }
    async call(systemPrompt, userPrompt, options) {
        const temperature = options?.temperature ?? 0.2;
        // Anthropic has no native JSON mode — use prompt engineering
        let finalSystemPrompt = systemPrompt;
        if (options?.responseFormat === 'json') {
            finalSystemPrompt +=
                '\n\nIMPORTANT: Respond ONLY with valid JSON. No explanation, no markdown fences, no text before or after the JSON.';
        }
        const message = await this.client.messages.create({
            model: this.model,
            max_tokens: options?.maxTokens ?? 8096,
            temperature,
            system: finalSystemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
        });
        // Extract text from content blocks (ContentBlock[] — filter for type === 'text')
        const content = message.content
            .filter((block) => block.type === 'text')
            .map((block) => block.text)
            .join('');
        return {
            content,
            usage: {
                inputTokens: message.usage.input_tokens,
                outputTokens: message.usage.output_tokens,
            },
            model: message.model,
        };
    }
}
//# sourceMappingURL=anthropic.js.map