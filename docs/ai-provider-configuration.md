# AI Provider Configuration Guide

> Multi-provider LLM integration with automatic fallback

JobTailor supports multiple AI providers (OpenAI, Google Gemini, NVIDIA NIM) with a unified abstraction layer. This ensures resilience against provider outages and gives you flexibility to use your available API keys.

---

## providers

| Provider | Model Used | Cost | Quality | Latency |
|----------|------------|------|---------|---------|
| OpenAI | `gpt-4o-mini` | Moderate | Excellent | Low |
| Google Gemini | `gemini-1.5-flash` | Low | Good | Low |
| NVIDIA NIM | `meta/llama3-70b` | Very Low | Good | Medium |

---

## Configuration

### Environment Variables (`.env`)

Set at least one provider in `apps/server/.env`:

```bash
# Required: Choose your preferred default provider
PREFERRED_AI_PROVIDER=openai  # Options: openai, gemini, nvidia

# OpenAI (highly recommended for best quality)
OPENAI_API_KEY=sk-your-openai-api-key

# Google Gemini (cost-effective alternative)
GEMINI_API_KEY=your-gemini-api-key

# NVIDIA NIM (via your NIM endpoint)
NVIDIA_NIM_API_KEY=your-nvidia-nim-api-key
NVIDIA_NIM_BASE_URL=https://integrate.api.nvidia.com/v1
```

**Production validation**: The server will fail to start if none of the providers are properly configured when `NODE_ENV=production`.

---

## How It Works

### Provider Manager (`ai-provider/provider-manager.ts`)

The `AIProviderManager` singleton:

1. **Initialization**: At server startup, reads environment config and initializes adapters for all configured providers (ignoring placeholder values like `"your-api-key-here"`).
2. **Fallback Order**: Determines the sequence:
   ```typescript
   fallbackOrder = [
     PREFERRED_AI_PROVIDER, // if configured and available
     'openai',             // if available
     'gemini',             // if available
     'nvidia'              // if available
   ].filter(provider => isConfigured(provider));
   ```
3. **Auto-Failover**: When an LLM call fails (API error, timeout, rate limit), the manager automatically retries with the next provider in the fallback order.

### Usage in Services (No Changes Needed)

All AI-powered services already use the abstraction layer:

- `jd-parser.service.ts`: `parseJD()` → structured JD extraction
- `resume-tailor.service.ts`: `rewriteSummary()` → summary rewriting
- `ats-scoring.service.ts`: `semanticScore()` → semantic ATS scoring

Example from `jd-parser.service.ts`:

```typescript
const parsed = await aiProviderManager.generateStructuredOutput<IParsedJD>(
  `Parse this job description:\n\n${jdRawText}`,
  systemPrompt,
  undefined,
  { temperature: 0.2, maxTokens: 2000 }
);
```

You don't need to know which provider is used; the manager picks the best available according to the fallback order.

---

## Testing Providers

### Local Development

1. Set only one provider (e.g., OpenAI) to avoid unnecessary costs:

   ```bash
   # apps/server/.env
   PREFERRED_AI_PROVIDER=openai
   OPENAI_API_KEY=sk-...
   ```

2. Start the server:

   ```bash
   npm run dev
   ```

3. Trigger an AI call (paste a JD and click "Parse" or generate a resume). Check server logs for provider selection:

   ```
   [AIProviderManager] Provider 'openai' succeeded
   ```

### Simulating Failover

To test fallback behavior:

1. Configure two providers (e.g., OpenAI + Gemini).
2. Temporarily set an invalid API key for the preferred provider or disconnect your network.
3. Observe logs:

   ```
   ⚠️ [AIProviderManager] Provider 'openai' failed: ...
   [AIProviderManager] Provider 'gemini' succeeded
   ```

---

## Provider-Specific Notes

### OpenAI (Default)

- **Model**: `gpt-4o-mini` (cost-effective, fast)
- **Features**: JSON mode, token usage tracking
- **Rate limits**: Vary by tier; monitor usage in OpenAI dashboard

### Google Gemini

- **Model**: `gemini-1.5-flash`
- **Features**: Native JSON response via `responseMimeType`
- **Rate limits**: 60 requests/minute on free tier

### NVIDIA NIM

- **Model**: `meta/llama3-70b` (or other NIM microservices)
- **Endpoint**: Your NIM base URL (e.g., `https://integrate.api.nvidia.com/v1`)
- **Authentication**: API key (NVIDIA NIM API key)
- **Note**: Ensure your NIM endpoint supports OpenAI-compatible chat completions API

---

## Token Usage & Cost Monitoring

The `AICompletion` result includes usage metrics:

```typescript
const result = await aiProviderManager.generateCompletion(...);
console.log(result.usage); // { inputTokens, outputTokens, totalTokens }
```

Consider adding a daily/weekly usage logger or metrics aggregation if cost control is critical.

---

## Production Checklist

- [ ] Set **at least one** API key (OpenAI, Gemini, or NVIDIA NIM) in production environment
- [ ] Set `PREFERRED_AI_PROVIDER` to your primary provider
- [ ] Ensure `NODE_ENV=production` to enforce validation
- [ ] Monitor logs for `All configured AI providers failed` errors (indicates all providers are down or misconfigured)
- [ ] Set up alerts for high AI usage/costs
- [ ] Consider adding a circuit breaker pattern to stop retrying after N failures to avoid latency

---

## Extending with New Providers

To add another provider (e.g., Anthropic Claude):

1. Create `src/services/ai-provider/claude-adapter.ts`:

   ```typescript
   import { AIProvider, CompletionOptions, AICompletion } from './types.js';
   import Anthropic from '@anthropic-ai/sdk';

   export class ClaudeAdapter implements AIProvider {
     private client: Anthropic;

     constructor(apiKey: string) {
       this.client = new Anthropic({ apiKey });
     }

     async generateCompletion(
       prompt: string,
       systemPrompt?: string,
       options?: CompletionOptions
     ): Promise<AICompletion> {
       const response = await this.client.messages.create({
         model: options?.model || 'claude-3-haiku-20240307',
         system: systemPrompt,
         messages: [{ role: 'user', content: prompt }],
         max_tokens: options?.maxTokens || 2000,
         temperature: options?.temperature ?? 0.2,
       });

       return {
         content: response.content[0]?.text || '',
         usage: {
           inputTokens: response.usage?.input_tokens,
           outputTokens: response.usage?.output_tokens,
         },
         modelUsed: response.model,
       };
     }

     async generateStructuredOutput<T>(
       prompt: string,
       systemPrompt: string,
       schema?: object,
       options?: CompletionOptions
     ): Promise<T> {
       // Claude supports JSON mode via `json` prefix in prompt or tool use.
       // For simplicity, request JSON in system prompt.
       const completion = await this.generateCompletion(
         `Respond ONLY with valid JSON matching this schema: ${JSON.stringify(schema)}\n\n${prompt}`,
         systemPrompt,
         { ...options, jsonResponse: true }
       );
       return JSON.parse(completion.content) as T;
     }
   }
   ```

2. Install the SDK: `npm install @anthropic-ai/sdk` in `apps/server`.
3. Add config fields in `apps/server/src/config/index.ts`.
4. Register in `AIProviderManager` constructor.
5. Update `.env.example`.

---

## FAQ

**Q: Will switching providers degrade quality?**  
A: OpenAI (GPT-4o-mini) generally yields the best results for parsing and rewriting. Gemini is a good cost-effective alternative. NVIDIA NIM (Llama 3 70B) is competitive but may need prompt tuning. The fallback order lets you prioritize quality while having backups.

**Q: How are costs distributed across providers?**  
A: The abstraction layer doesn't track costs per provider; you must monitor each provider's dashboard. Token usage is exposed for custom cost calculation.

**Q: Can I force a specific provider for a specific task?**  
A: Not currently. The manager uses the same fallback order for all calls. To force a provider, set `PREFERRED_AI_PROVIDER` and disable others (remove their keys). Future versions may allow per-call provider override.

**Q: What happens if all providers fail?**  
A: The promise rejects with an aggregation of all errors. Services that call AI have try/catch fallbacks (e.g., `ats-scoring` returns a default score; `resume-tailor` keeps original summary).

**Q: Do I need to modify existing code to use the abstraction layer?**  
A: No. The services (`jd-parser`, `resume-tailor`, `ats-scoring`) already use `aiProviderManager`. Just configure your API keys and restart the server.

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| `No AI providers configured` error at startup | None of the provider env vars are set in production | Set at least one of `OPENAI_API_KEY`, `GEMINI_API_KEY`, or `NVIDIA_NIM_API_KEY` |
| `All configured AI providers failed` | All providers returned errors (invalid key, network, rate limit) | Check API keys, provider status pages, and logs for specific error messages |
| `Provider 'openai' failed: 429 Too Many Requests` | Rate limit exceeded | Add retry with exponential backoff, or switch preferred provider to one with higher limits |
| Paraphrasing is poor with non-OpenAI providers | Model capabilities differ | Adjust `temperature` and prompts; consider using OpenAI as primary if quality is paramount |

---
