import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIProvider, CompletionOptions, AICompletion } from './types.js';

export class GeminiAdapter implements AIProvider {
  private client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async generateCompletion(
    prompt: string,
    systemPrompt?: string,
    options?: CompletionOptions
  ): Promise<AICompletion> {
    const modelName = options?.model || 'gemini-1.5-flash';
    
    const model = this.client.getGenerativeModel({
      model: modelName,
      systemInstruction: systemPrompt || undefined,
    });

    const generationConfig: any = {
      temperature: options?.temperature ?? 0.2,
      maxOutputTokens: options?.maxTokens,
    };

    if (options?.jsonResponse) {
      generationConfig.responseMimeType = 'application/json';
    }

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig
    });

    const response = result.response;
    const content = response.text() || '';

    return {
      content,
      usage: {},
      modelUsed: modelName
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
