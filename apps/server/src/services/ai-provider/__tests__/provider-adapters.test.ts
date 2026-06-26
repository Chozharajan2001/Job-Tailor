import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIAdapter } from '../openai-adapter.js';
import { GeminiAdapter } from '../gemini-adapter.js';
import { NvidiaNimAdapter } from '../nvidia-nim-adapter.js';
import { extractAndParseJson } from '../utils.js';

// Setup Mock for OpenAI client
const mockCreate = vi.fn();
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => {
      return {
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      };
    }),
  };
});

// Setup Mock for Gemini client
const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn(() => ({
  generateContent: mockGenerateContent,
}));
vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: vi.fn().mockImplementation(() => {
      return {
        getGenerativeModel: mockGetGenerativeModel,
      };
    }),
  };
});

describe('AI Provider Adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('OpenAIAdapter', () => {
    it('should generate completion with proper parameters', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'Test Response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: 'gpt-4o-mini',
      });

      const adapter = new OpenAIAdapter('test-api-key');
      const result = await adapter.generateCompletion('User Prompt', 'System Prompt', {
        temperature: 0.5,
        maxTokens: 100,
        model: 'gpt-4o',
      });

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'System Prompt' },
          { role: 'user', content: 'User Prompt' },
        ],
        temperature: 0.5,
        max_tokens: 100,
        response_format: undefined,
      });

      expect(result).toEqual({
        content: 'Test Response',
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
        },
        modelUsed: 'gpt-4o-mini',
      });
    });

    it('should request json response format when jsonResponse is set', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '{"status": "ok"}' } }],
        model: 'gpt-4o-mini',
      });

      const adapter = new OpenAIAdapter('test-api-key');
      await adapter.generateCompletion('Prompt', undefined, { jsonResponse: true });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          response_format: { type: 'json_object' },
        })
      );
    });

    it('should generate structured output by parsing json content', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '{"foo": "bar"}' } }],
        model: 'gpt-4o-mini',
      });

      const adapter = new OpenAIAdapter('test-api-key');
      const result = await adapter.generateStructuredOutput<{ foo: string }>(
        'Prompt',
        'System Prompt'
      );

      expect(result).toEqual({ foo: 'bar' });
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          response_format: { type: 'json_object' },
        })
      );
    });
  });

  describe('GeminiAdapter', () => {
    it('should generate completion with proper parameters', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => 'Gemini Test Response',
        },
      });

      const adapter = new GeminiAdapter('test-api-key');
      const result = await adapter.generateCompletion('User Prompt', 'System Prompt', {
        temperature: 0.7,
        maxTokens: 50,
      });

      expect(mockGetGenerativeModel).toHaveBeenCalledWith({
        model: 'gemini-1.5-flash',
        systemInstruction: 'System Prompt',
      });

      expect(mockGenerateContent).toHaveBeenCalledWith({
        contents: [{ role: 'user', parts: [{ text: 'User Prompt' }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 50,
        },
      });

      expect(result.content).toBe('Gemini Test Response');
      expect(result.modelUsed).toBe('gemini-1.5-flash');
    });

    it('should request json response type when jsonResponse is set', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => '{"status": "gemini-ok"}',
        },
      });

      const adapter = new GeminiAdapter('test-api-key');
      await adapter.generateCompletion('Prompt', undefined, { jsonResponse: true });

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          generationConfig: expect.objectContaining({
            responseMimeType: 'application/json',
          }),
        })
      );
    });

    it('should generate structured output successfully', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => '{"parsed": true}',
        },
      });

      const adapter = new GeminiAdapter('test-api-key');
      const result = await adapter.generateStructuredOutput<{ parsed: boolean }>(
        'Prompt',
        'System Prompt'
      );

      expect(result).toEqual({ parsed: true });
    });
  });

  describe('NvidiaNimAdapter', () => {
    it('should call OpenAI endpoint with custom base URL', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'Nvidia NIM Response' } }],
        model: 'meta/llama-3.1-70b-instruct',
      });

      const adapter = new NvidiaNimAdapter('test-api-key', 'https://nim.nvidia.com/v1');
      const result = await adapter.generateCompletion('Prompt', 'System');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'meta/llama-3.1-70b-instruct',
        })
      );
      expect(result.content).toBe('Nvidia NIM Response');
    });
  });

  describe('extractAndParseJson', () => {
    it('parses json wrapped in markdown code fences', () => {
      const result = extractAndParseJson<{ status: string }>('```json\n{"status":"ok"}\n```');
      expect(result).toEqual({ status: 'ok' });
    });

    it('parses json surrounded by conversational text', () => {
      const result = extractAndParseJson<{ status: string }>(
        'Sure, here is your requested object: {"status":"ok"} Let me know if you need anything else.'
      );
      expect(result).toEqual({ status: 'ok' });
    });
  });
});
