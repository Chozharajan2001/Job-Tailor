export interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  jsonResponse?: boolean;
}

export interface AICompletion {
  content: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  modelUsed?: string;
}

export interface AIProvider {
  generateCompletion(
    prompt: string,
    systemPrompt?: string,
    options?: CompletionOptions
  ): Promise<AICompletion>;
  
  generateStructuredOutput<T>(
    prompt: string,
    systemPrompt: string,
    schema?: object,
    options?: CompletionOptions
  ): Promise<T>;
}
