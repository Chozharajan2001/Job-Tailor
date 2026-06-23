import { AIProvider, CompletionOptions, AICompletion } from './types.js';
import { OpenAIAdapter } from './openai-adapter.js';
import { GeminiAdapter } from './gemini-adapter.js';
import { NvidiaNimAdapter } from './nvidia-nim-adapter.js';
import { config } from '../../config/index.js';

export class AIProviderManager {
  private providers: Map<string, AIProvider> = new Map();
  private fallbackOrder: string[];

  constructor() {
    // Initialize providers based on available API keys in config.
    // Skip if they are default placeholders.
    if (config.openaiApiKey && !config.openaiApiKey.includes('your-openai-api-key')) {
      this.providers.set('openai', new OpenAIAdapter(config.openaiApiKey));
    }

    if (config.geminiApiKey && !config.geminiApiKey.includes('your-gemini-api-key')) {
      this.providers.set('gemini', new GeminiAdapter(config.geminiApiKey));
    }

    if (
      config.nvidiaNimApiKey && 
      !config.nvidiaNimApiKey.includes('your-nvidia-nim-api-key') &&
      config.nvidiaNimBaseUrl
    ) {
      this.providers.set('nvidia', new NvidiaNimAdapter(
        config.nvidiaNimApiKey,
        config.nvidiaNimBaseUrl
      ));
    }

    // Define fallback order - starting with preferred provider if configured and available
    const preferred = config.preferredProvider;
    this.fallbackOrder = [
      ...(preferred ? [preferred] : []),
      'openai',
      'gemini',
      'nvidia'
    ].filter(provider => this.providers.has(provider));
    
    // De-duplicate fallback order
    this.fallbackOrder = Array.from(new Set(this.fallbackOrder));
  }

  // Exposed for testing
  getFallbackOrder(): string[] {
    return this.fallbackOrder;
  }

  // Exposed for testing / custom overrides
  getProvider(name: string): AIProvider | undefined {
    return this.providers.get(name);
  }

  async generateCompletion(
    prompt: string,
    systemPrompt?: string,
    options?: CompletionOptions
  ): Promise<AICompletion> {
    if (this.fallbackOrder.length === 0) {
      throw new Error('No AI providers configured or available. Please check environment variables.');
    }

    const errors: Array<{ provider: string; message: string }> = [];

    for (const providerName of this.fallbackOrder) {
      const provider = this.providers.get(providerName);
      if (provider) {
        try {
          return await provider.generateCompletion(prompt, systemPrompt, options);
        } catch (error: any) {
          const errMsg = error.message || String(error);
          console.warn(`⚠️ [AIProviderManager] Provider '${providerName}' failed: ${errMsg}`);
          errors.push({ provider: providerName, message: errMsg });
        }
      }
    }

    throw new Error(
      `All configured AI providers failed to generate completion. Errors: ${JSON.stringify(errors)}`
    );
  }

  async generateStructuredOutput<T>(
    prompt: string,
    systemPrompt: string,
    schema?: object,
    options?: CompletionOptions
  ): Promise<T> {
    if (this.fallbackOrder.length === 0) {
      throw new Error('No AI providers configured or available. Please check environment variables.');
    }

    const errors: Array<{ provider: string; message: string }> = [];

    for (const providerName of this.fallbackOrder) {
      const provider = this.providers.get(providerName);
      if (provider) {
        try {
          return await provider.generateStructuredOutput<T>(prompt, systemPrompt, schema, options);
        } catch (error: any) {
          const errMsg = error.message || String(error);
          console.warn(`⚠️ [AIProviderManager] Provider '${providerName}' failed structured output: ${errMsg}`);
          errors.push({ provider: providerName, message: errMsg });
        }
      }
    }

    throw new Error(
      `All configured AI providers failed to generate structured output. Errors: ${JSON.stringify(errors)}`
    );
  }
}

// Singleton instance
export const aiProviderManager = new AIProviderManager();
