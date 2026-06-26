# AI Provider Architecture

> Goal: keep the application code independent from any single AI vendor.

JobTailor uses an interface-first AI layer so the app can work with OpenAI, Gemini, NVIDIA NIM, and future providers like Grok without changing business logic.

## Design Principles

1. One internal contract for all AI calls.
2. Vendor-specific adapters stay isolated.
3. Provider choice is configuration-driven, not hardcoded.
4. Fallback behavior stays centralized.
5. Business services never call vendor SDKs directly.

## Core Layers

### 1. Application Services

These are the only places the rest of the app should touch.

Examples:
- JD parsing
- resume summary rewriting
- semantic ATS scoring

These services call the provider manager, not a vendor SDK.

### 2. Provider Manager

The provider manager is the single routing point for AI calls.

Responsibilities:
- read environment config
- register enabled providers
- pick the preferred provider
- fall back to the next available provider on failure
- expose a stable API for completions and structured outputs

### 3. Provider Adapters

Each provider gets its own adapter implementation.

Examples:
- `OpenAIAdapter`
- `GeminiAdapter`
- `NvidiaNimAdapter`

Each adapter is responsible for:
- request formatting
- response mapping
- vendor-specific quirks
- error normalization

## Stable Contract

The app should rely on a small stable interface, such as:

- `generateCompletion(prompt, systemPrompt, options)`
- `generateStructuredOutput(prompt, systemPrompt, schema, options)`

Later additions can include:

- `generateEmbeddings()`
- `moderateText()`
- `generateVisionOutput()`

## Configuration

Provider selection should come from environment variables:

- `PREFERRED_AI_PROVIDER`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `NVIDIA_NIM_API_KEY`
- `NVIDIA_NIM_BASE_URL`

This keeps provider changes out of the code path.

## Extending With a New Provider

To add a new provider, for example Grok:

1. create a new adapter
2. add config values for key/base URL/model
3. register the adapter in the provider manager
4. add tests for response mapping and fallback
5. avoid changing application services

If the app layer needs edits, the interface is too leaky.

## Why This Matters

This design gives JobTailor:
- easy provider swapping
- lower vendor lock-in
- cleaner testing
- simpler fallback behavior
- maintainable long-term AI integration

## Project Rule

All AI-powered business logic must call the provider manager, not a vendor SDK directly.

That rule keeps the application easy to upgrade when models, pricing, or provider availability changes.

## Provider Extension Checklist

Use this checklist when implementing support for a new AI provider (e.g., Grok):

### 1. Define the Adapter Class
- [ ] Create a new file in `apps/server/src/services/ai-provider/<provider>-adapter.ts`.
- [ ] Implement the `AIProvider` interface imported from `./types.js`.
- [ ] Implement `generateCompletion(prompt, systemPrompt, options)` and map responses to `AICompletion`.
- [ ] Implement `generateStructuredOutput<T>(prompt, systemPrompt, schema, options)` conforming to JSON schema or manual parsing.
- [ ] Catch provider-specific HTTP/SDK errors and throw normalized exceptions.

### 2. Configure Environment Variables & Config Schemas
- [ ] Add the environment variable for your provider API key (and endpoint if custom) to the `.env` configuration.
- [ ] Update the config schema (in `apps/server/src/config/index.ts`) to validate the new credentials and export them safely.
- [ ] Add the provider name to the allowed list for the `PREFERRED_AI_PROVIDER` (if typed/validated).

### 3. Register with the Provider Manager
- [ ] Import the new adapter in `apps/server/src/services/ai-provider/provider-manager.ts`.
- [ ] In the `AIProviderManager` constructor, check if the credentials exist and instantiate/register the new adapter in `this.providers`.
- [ ] Add the new provider key to the default list in `fallbackOrder` list processing.

### 4. Write Verification Tests
- [ ] Add unit tests in `apps/server/src/services/ai-provider/__tests__/provider-adapters.test.ts` to mock raw API calls and verify completion/structured mapping.
- [ ] Add fallback tests in `provider-manager.test.ts` confirming the manager successfully delegates to and falls back from your new provider.
- [ ] Run `npm run test -w job-tailor-server` to confirm workspace tests pass cleanly.


