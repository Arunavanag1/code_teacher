import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, CallOptions, LLMResponse } from './index.js';

export class AnthropicProvider implements LLMProvider {
  public readonly name = 'anthropic';
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async call(
    systemPrompt: string,
    userPrompt: string,
    options?: CallOptions,
  ): Promise<LLMResponse> {
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
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
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
