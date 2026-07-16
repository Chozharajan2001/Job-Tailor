import OpenAI from 'openai';
import { AIProvider, CompletionOptions, AICompletion } from './types.js';
import { extractAndParseJson } from './utils.js';

export class NvidiaNimAdapter implements AIProvider {
  private client: OpenAI;
  private defaultModel: string;

  constructor(apiKey: string, baseUrl: string, defaultModel?: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl
    });
    this.defaultModel = defaultModel || 'openai/gpt-oss-20b';
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
      model: options?.model || this.defaultModel,
      messages,
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.maxTokens,
      response_format: options?.jsonResponse ? { type: 'json_object' } : undefined
    });

    console.log(35, response)
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
    console.log(56)
    const completion = await this.generateCompletion(prompt, systemPrompt, {
      ...options,
      jsonResponse: true
    });
    return extractAndParseJson<T>(completion.content);
  }
}
