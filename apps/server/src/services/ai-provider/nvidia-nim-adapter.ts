import OpenAI from 'openai';
import { AIProvider, CompletionOptions, AICompletion } from './types.js';

export class NvidiaNimAdapter implements AIProvider {
  private client: OpenAI;

  constructor(apiKey: string, baseUrl: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl
    });
  }

  async generateCompletion(
    prompt: string,
    systemPrompt?: string,
    options?: CompletionOptions
  ): Promise<AICompletion> {
    const messages = [
      ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
      { role: 'user' as const, content: prompt }
    ];

    const response = await this.client.chat.completions.create({
      model: options?.model || 'meta/llama3-70b',
      messages,
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.maxTokens,
      response_format: options?.jsonResponse ? { type: 'json_object' } : undefined
    });

    const content = response.choices[0]?.message?.content || '';
    const usage = response.usage;

    return {
      content,
      usage: {
        inputTokens: usage?.prompt_tokens,
        outputTokens: usage?.completion_tokens,
        totalTokens: usage?.total_tokens
      },
      modelUsed: response.model
    };
  }

  async generateStructuredOutput<T>(
    prompt: string,
    systemPrompt: string,
    schema?: object,
    options?: CompletionOptions
  ): Promise<T> {
    const completion = await this.generateCompletion(prompt, systemPrompt, {
      ...options,
      jsonResponse: true
    });
    return JSON.parse(completion.content) as T;
  }
}
