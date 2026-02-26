import OpenAI from 'openai';
export class OpenAIProvider {
    name = 'openai';
    client;
    model;
    constructor(apiKey, model) {
        this.client = new OpenAI({ apiKey });
        this.model = model;
    }
    async call(systemPrompt, userPrompt, options) {
        const temperature = options?.temperature ?? 0.2;
        // OpenAI has native JSON mode via response_format.
        // When JSON mode is active, "json" must appear in the messages — append a reminder to system prompt.
        let finalSystemPrompt = systemPrompt;
        if (options?.responseFormat === 'json') {
            finalSystemPrompt += '\n\nRespond with valid JSON only.';
        }
        const completion = await this.client.chat.completions.create({
            model: this.model,
            messages: [
                { role: 'system', content: finalSystemPrompt },
                { role: 'user', content: userPrompt },
            ],
            temperature,
            max_tokens: options?.maxTokens ?? 8096,
            ...(options?.responseFormat === 'json'
                ? { response_format: { type: 'json_object' } }
                : {}),
        });
        return {
            content: completion.choices[0]?.message.content ?? '',
            usage: {
                inputTokens: completion.usage?.prompt_tokens ?? 0,
                outputTokens: completion.usage?.completion_tokens ?? 0,
            },
            model: completion.model,
        };
    }
}
//# sourceMappingURL=openai.js.map