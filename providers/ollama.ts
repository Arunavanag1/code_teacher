/**
 * Ollama provider
 * Uses the OpenAI-compatible API exposed by Ollama at localhost:11434/v1.
 * Reuses the existing `openai` npm package — no additional dependencies.
 * No API key required for local inference.
 */

import OpenAI from 'openai';
import type { LLMProvider, CallOptions, LLMResponse } from './index.js';

export class OllamaProvider implements LLMProvider {
  public readonly name = 'ollama';
  private client: OpenAI;
  private model: string;

  constructor(model: string, baseURL?: string) {
    this.model = model;
    this.client = new OpenAI({
      apiKey: 'ollama', // Ollama doesn't require an API key, but the SDK needs a non-empty string
      baseURL: baseURL ?? 'http://localhost:11434/v1',
    });
  }

  async call(
    systemPrompt: string,
    userPrompt: string,
    options?: CallOptions,
  ): Promise<LLMResponse> {
    const temperature = options?.temperature ?? 0.2;

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
        ? { response_format: { type: 'json_object' as const } }
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
