import { describe, it, expect, vi, beforeEach } from 'vitest';
import { config } from '../../../config/index.js';

// Mock config module at the correct path relative to the test file
vi.mock('../../../config/index.js', () => {
  return {
    config: {
      openaiApiKey: '',
      geminiApiKey: '',
      nvidiaNimApiKey: '',
      nvidiaNimBaseUrl: '',
      preferredProvider: 'openai',
    },
  };
});

// Setup mocks for adapter methods
const mockOpenAIGenerate = vi.fn();
const mockGeminiGenerate = vi.fn();
const mockNvidiaGenerate = vi.fn();

const mockOpenAIStructured = vi.fn();
const mockGeminiStructured = vi.fn();
const mockNvidiaStructured = vi.fn();

vi.mock('../openai-adapter.js', () => {
  return {
    OpenAIAdapter: vi.fn().mockImplementation(() => ({
      generateCompletion: mockOpenAIGenerate,
      generateStructuredOutput: mockOpenAIStructured,
    })),
  };
});

vi.mock('../gemini-adapter.js', () => {
  return {
    GeminiAdapter: vi.fn().mockImplementation(() => ({
      generateCompletion: mockGeminiGenerate,
      generateStructuredOutput: mockGeminiStructured,
    })),
  };
});

vi.mock('../nvidia-nim-adapter.js', () => {
  return {
    NvidiaNimAdapter: vi.fn().mockImplementation(() => ({
      generateCompletion: mockNvidiaGenerate,
      generateStructuredOutput: mockNvidiaStructured,
    })),
  };
});

// Import manager dynamically to ensure config mocks are loaded
import { AIProviderManager } from '../provider-manager.js';

describe('AIProviderManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock config state by mutating the mocked config export directly
    (config as any).openaiApiKey = 'valid-openai-key';
    (config as any).geminiApiKey = 'valid-gemini-key';
    (config as any).nvidiaNimApiKey = 'valid-nvidia-key';
    (config as any).nvidiaNimBaseUrl = 'http://nvidia-base';
    (config as any).preferredProvider = 'openai';
  });

  describe('Initialization and Fallback Order', () => {
    it('should build fallback order based on configured keys', () => {
      const manager = new AIProviderManager();
      expect(manager.getFallbackOrder()).toEqual(['openai', 'gemini', 'nvidia']);
    });

    it('should prioritize the preferred provider if configured', () => {
      (config as any).preferredProvider = 'gemini';
      const manager = new AIProviderManager();
      expect(manager.getFallbackOrder()).toEqual(['gemini', 'openai', 'nvidia']);
    });

    it('should ignore placeholder keys', () => {
      (config as any).openaiApiKey = 'sk-your-openai-api-key-here'; // placeholder
      (config as any).geminiApiKey = 'valid-gemini-key';
      (config as any).nvidiaNimApiKey = 'your-nvidia-nim-api-key'; // placeholder
      
      const manager = new AIProviderManager();
      expect(manager.getFallbackOrder()).toEqual(['gemini']);
    });

    it('should have empty fallback order if no keys configured', () => {
      (config as any).openaiApiKey = '';
      (config as any).geminiApiKey = '';
      (config as any).nvidiaNimApiKey = '';

      const manager = new AIProviderManager();
      expect(manager.getFallbackOrder()).toEqual([]);
    });
  });

  describe('Dynamic Fallback Execures', () => {
    it('should return result from primary provider if it succeeds', async () => {
      (config as any).preferredProvider = 'openai';
      const manager = new AIProviderManager();

      mockOpenAIGenerate.mockResolvedValueOnce({ content: 'OpenAI Success' });

      const result = await manager.generateCompletion('Prompt');

      expect(result.content).toBe('OpenAI Success');
      expect(mockOpenAIGenerate).toHaveBeenCalledTimes(1);
      expect(mockGeminiGenerate).not.toHaveBeenCalled();
    });

    it('should fall back to next provider if primary fails', async () => {
      (config as any).preferredProvider = 'openai';
      const manager = new AIProviderManager();

      mockOpenAIGenerate.mockRejectedValueOnce(new Error('Rate Limit'));
      mockGeminiGenerate.mockResolvedValueOnce({ content: 'Gemini Success' });

      const result = await manager.generateCompletion('Prompt');

      expect(result.content).toBe('Gemini Success');
      expect(mockOpenAIGenerate).toHaveBeenCalledTimes(1);
      expect(mockGeminiGenerate).toHaveBeenCalledTimes(1);
    });

    it('should throw error aggregating all failures if all providers fail', async () => {
      (config as any).preferredProvider = 'openai';
      const manager = new AIProviderManager();

      mockOpenAIGenerate.mockRejectedValueOnce(new Error('OpenAI Off'));
      mockGeminiGenerate.mockRejectedValueOnce(new Error('Gemini Off'));
      mockNvidiaGenerate.mockRejectedValueOnce(new Error('Nvidia Off'));

      await expect(manager.generateCompletion('Prompt')).rejects.toThrow(
        /All configured AI providers failed to generate completion/
      );

      expect(mockOpenAIGenerate).toHaveBeenCalledTimes(1);
      expect(mockGeminiGenerate).toHaveBeenCalledTimes(1);
      expect(mockNvidiaGenerate).toHaveBeenCalledTimes(1);
    });
  });

  describe('Structured Output Fallback Execures', () => {
    it('should fall back correctly for structured outputs', async () => {
      (config as any).preferredProvider = 'openai';
      const manager = new AIProviderManager();

      mockOpenAIStructured.mockRejectedValueOnce(new Error('Auth failed'));
      mockGeminiStructured.mockResolvedValueOnce({ ok: true });

      const result = await manager.generateStructuredOutput<any>('Prompt', 'System');

      expect(result).toEqual({ ok: true });
      expect(mockOpenAIStructured).toHaveBeenCalledTimes(1);
      expect(mockGeminiStructured).toHaveBeenCalledTimes(1);
    });
  });
});
