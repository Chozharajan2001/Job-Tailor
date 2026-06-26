# AI Provider Sprint Plan

> Goal: keep JobTailor’s AI layer interface-first, vendor-agnostic, and easy to extend.
>
> Scope: provider abstraction, adapter implementation, testing, observability, and future provider onboarding.

## Sprint Objective

Build and maintain a stable AI provider subsystem that can support OpenAI, Gemini, NVIDIA NIM, and future providers such as Grok without changing application business logic.

## Success Criteria

This sprint is complete when:

- all AI calls go through a single provider interface
- vendor-specific logic is isolated in adapters
- provider selection is configuration-driven
- fallback behavior works deterministically
- tests cover provider selection, success, and failover paths
- documentation tells future contributors how to add a new provider

## Non-Goals

Do not use this sprint to:

- rewrite job parsing or resume tailoring logic
- hardcode a new vendor into business services
- change AI prompts without a clear need
- add provider-specific logic to controllers or UI
- add model routing logic outside the provider manager

## Current State Snapshot

Already in place:

- `AIProvider` interface in `apps/server/src/services/ai-provider/types.ts`
- provider manager in `apps/server/src/services/ai-provider/provider-manager.ts`
- adapters for OpenAI, Gemini, and NVIDIA NIM
- business services that already call the manager
- `docs/ai-provider-architecture.md`

Remaining work should focus on hardening the abstraction and making extension safer.

## Sprint Phases

### Phase 1: Contract Hardening

Goal: make the provider interface explicit and stable.

Tasks:

1. review `AIProvider` methods for completeness
2. confirm completion and structured-output behavior are sufficient for all current services
3. decide whether embeddings or moderation should become first-class interface methods
4. document any method-level expectations, including retries and error shape

Verification:

- interface methods are minimal and stable
- no service relies on vendor-specific response handling
- typecheck passes after any contract refinements

### Phase 2: Adapter Isolation

Goal: ensure each vendor is fully isolated.

Tasks:

1. keep request formatting inside the adapter
2. keep response mapping inside the adapter
3. normalize error handling so the manager sees a consistent failure shape
4. keep async or polling-specific model behavior contained
5. prevent SDK imports from leaking into application services

Verification:

- services never import OpenAI, Gemini, or NIM SDKs directly
- adding a provider requires only one adapter file plus config and registration
- adapter tests cover happy path and error path

### Phase 3: Provider Manager Discipline

Goal: keep routing and fallback centralized.

Tasks:

1. maintain a single provider registry
2. preserve fallback ordering rules
3. keep preferred provider selection in config
4. ensure unavailable providers are skipped cleanly
5. preserve deterministic fallback behavior across calls

Verification:

- the same config yields the same provider order
- disabled or invalid providers are excluded
- fallback succeeds when the preferred provider fails

### Phase 4: Configuration and Environment

Goal: make provider changes a config operation first.

Tasks:

1. keep provider keys in `.env.example`
2. validate production startup when no provider is configured
3. document preferred provider behavior
4. keep model names and base URLs outside the business layer

Verification:

- configuration docs match runtime behavior
- production validation prevents “no provider” startup
- local dev works with one provider only

### Phase 5: Testing and Reliability

Goal: make provider changes safe.

Tasks:

1. add unit tests for manager fallback
2. add adapter tests for request/response mapping
3. test structured-output handling
4. test provider failure aggregation
5. test any new provider before enabling it by default

Verification:

- tests cover success, failure, and failover
- provider changes don’t break parsing or resume rewriting
- `npm run typecheck` passes
- `npm run test` passes

### Phase 6: Documentation and Onboarding

Goal: make it easy for the next contributor to add a provider.

Tasks:

1. keep `docs/ai-provider-architecture.md` updated
2. keep the provider extension checklist current
3. document when to use config versus code
4. document how to add a provider like Grok

Verification:

- a new contributor can add a provider without changing app services
- docs match the actual adapter manager behavior

## Recommended Execution Order

1. review and freeze the provider contract
2. verify adapter isolation
3. confirm provider manager fallback behavior
4. tighten config validation and defaults
5. expand tests
6. update documentation

## Add-A-New-Provider Checklist

To add a new provider such as Grok:

1. create a new adapter file
2. implement the shared `AIProvider` interface
3. map vendor requests and responses inside the adapter
4. add config variables for API key, base URL, and model name
5. register the adapter in the provider manager
6. add tests for success and fallback
7. update docs and examples
8. run typecheck and test

## Quality Rules

- business code must never call vendor SDKs directly
- provider selection must remain config-driven
- fallback behavior must remain centralized
- adapter logic should not leak into controllers
- documentation should reflect actual code behavior

## Suggested Definition of Done

The sprint is done when:

- the AI interface is stable
- provider adapters remain isolated
- adding a provider is mostly a config + adapter task
- tests prove fallback and response mapping
- the docs explain the extension path clearly

