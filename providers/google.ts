import { GoogleGenAI } from '@google/genai';
import type { LLMProvider, CallOptions, LLMResponse } from './index.js';

export class GoogleProvider implements LLMProvider {
  public readonly name = 'google';
  private ai: GoogleGenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async call(
    systemPrompt: string,
    userPrompt: string,
    options?: CallOptions,
  ): Promise<LLMResponse> {
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
