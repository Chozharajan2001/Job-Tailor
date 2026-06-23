# Sprint 4 Execution Checklist — Trust, Verification & Analytics

> Status: **COMPLETE** — all items verified 2026-06-23
>
> Verification: `npm run typecheck` ✅ · `npm run test` (34/34) ✅ · `npm run build` ✅

This checklist is the durable execution record for Sprint 4.
Mirrored into `docs/advanced-job-search-engine.md` and `MVP_STATUS.md`.

---

## 1. Code Implementation

### Backend Architecture

- [x] **Verification State on CanonicalJob** — added `verificationState` (`'unverified' | 'verified' | 'failed' | 'suspicious'`), `verificationAttempts`, `lastVerifiedAt`, and `verificationError` to `CanonicalJob.model.ts` and `packages/shared-types`.
- [x] **Search and Interaction Log Models** — created `SearchQueryLog.model.ts` and `JobInteractionLog.model.ts` Mongoose schemas with corresponding shared `ISearchQueryLog` / `IJobInteractionLog` interfaces.
- [x] **Extend Cleanup Service** — `CleanupService` now pings active job URLs sequentially (200 ms delay), marks 404 / redirect targets as `failed`, and dynamically decays source trust scores (`−0.05` per dead link, `+0.01` per passing check).
- [x] **Analytics Service** — `AnalyticsService` logs search queries, click-through interactions, and aggregates metrics for the dashboard endpoint.
- [x] **Feedback / Flagging Endpoints** — `flag_expired` and `flag_spam` endpoints adjust job `verificationState` and decay source trust scores (`−0.10` on spam report); registered under `search.routes.ts`.
- [x] **Exclude Failed & Suspicious Listings** — `SearchService` and `FeedService` both hard-filter out canonical jobs with `verificationState: 'failed'` or `'suspicious'` before returning results.

### Client Integration

- [x] **Result Card Flags** — flag expired / spam buttons wired to the feedback endpoint; click events fire the interaction log endpoint.
- [x] **Search Quality Dashboard** — third tab in `JobsPage.tsx` showing source trust scores, verification state breakdown (pie-style counts), top queries, and a manual link-check trigger button.

---

## 2. Proof & Verification

### Automated Proofs

- [x] **Workspace Typechecks** — `npm run typecheck` passes cleanly (3/3 packages).
- [x] **Workspace Build** — `npm run build` compiles both client and server for production (FULL TURBO, 0 errors).
- [x] **Vitest Test Suite** — `npm run test -w job-tailor-server` → **34 tests pass (3 files)** including:
  - `7. Ingestion Quality, Trust Decay & Search Analytics (Sprint 4)`
    - `should support verificationState defaults and update states on link checks`
    - `should log user click interactions and handle flagging feedback to update states/trust`
    - `should return aggregated quality and search logs in the dashboard`

### Sprint 4 Success Criteria Checklist

| Criterion | Status |
|---|---|
| Jobs carry `unverified \| verified \| failed \| suspicious` state | ✅ |
| Dead/spam flags update job state and trust | ✅ |
| Search logs and click logs are stored in MongoDB | ✅ |
| Failed and suspicious jobs excluded from search & feed | ✅ |
| Quality dashboard shows source trust, verification state, query metrics | ✅ |
| Repo compiles and all tests pass cleanly | ✅ |
