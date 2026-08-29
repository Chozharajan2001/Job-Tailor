import { GoogleGenAI } from "@google/genai";
import { AIProvider, CompletionOptions, AICompletion } from "./types.js";
import { extractAndParseJson } from "./utils.js";

export class GeminiAdapter implements AIProvider {
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generateCompletion(
    prompt: string,
    systemPrompt?: string,
    options?: CompletionOptions,
  ): Promise<AICompletion> {
    const modelName = options?.model || "gemini-2.0-flash";

    const response = await this.client.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: systemPrompt || undefined,
        temperature: options?.temperature ?? 0.2,
        maxOutputTokens: options?.maxTokens,
        ...(options?.jsonResponse
          ? { responseMimeType: "application/json" }
          : {}),
      },
    });

    const content = response.text || "";
    const usage = response.usageMetadata;

    return {
      content,
      usage: {
        inputTokens: usage?.promptTokenCount,
        outputTokens: usage?.candidatesTokenCount,
        totalTokens: usage?.totalTokenCount,
      },
      modelUsed: modelName,
    };
  }

  async generateStructuredOutput<T>(
    prompt: string,
    systemPrompt: string,
    schema?: object,
    options?: CompletionOptions,
  ): Promise<T> {
    const completion = await this.generateCompletion(prompt, systemPrompt, {
      ...options,
      jsonResponse: true,
    });
    return extractAndParseJson<T>(completion.content);
  }
}
