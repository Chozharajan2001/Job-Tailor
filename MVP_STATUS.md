# JobTailor MVP Status

> Last updated: 2026-09-27 (Tier 1 Feature 2 — Chrome Extension Auto-Track — shipped; Tier 1 Feature 1 shipped 2026-09-26)
> Prioritized next-work roadmap lives in [TODO_PLAN.md](./TODO_PLAN.md). This file records what is built.

## Tier 1 Feature 2 Shipped: Chrome Extension Auto-Track

A Manifest V3 browser extension (`apps/extension/`) detects when the user submits a job application on Greenhouse, Lever, Ashby, or Workday and — after an explicit popup confirm — creates the Job + Application on the server in one idempotent call.

- **Server side:** per-user API keys (`jtk_…`, SHA-256 hashed at rest, shown once, revocable — `ApiKey` model, `/api/v1/apikeys` JWT-protected CRUD, `authenticateByApiKey` middleware); `POST /api/v1/applications/from-extension` upserts the Job (exact `jobLink` → company+title within 60 days → create) and creates an Application with status `applied` and a provenance timeline event. Re-firing the same draft never duplicates (relies on the `(userId, jobId)` unique index).
- **Extension side:** platform registry with URL matchers (lookalike-domain-safe), per-platform detectors (thank-you URL / confirmation copy) and extractors (og:title, posting selectors, Ashby's `__ASBY__DATA` read as text without executing page JS); content script with MutationObserver + SPA history hooks; badge + confirm popup rendering page data via `textContent` only; options page with API-key storage, per-platform enable/always-add toggles, and a connection probe that distinguishes bad key (401) from valid key (400).
- **Security posture:** only the background service worker holds the key and touches the network; content scripts never see it. "Always add" is opt-in per platform, off by default.
- **Tests:** 26 extension tests (manifest, registry, fixture-based detector/extractor logic incl. a script-injection resistance case) + server tests (apikey 12, upsert 5, from-extension 6, e2e flow 1). Build verified producing a loadable `dist/`.
- **Manual step remaining:** load `apps/extension/dist` via chrome://extensions → Load unpacked and apply to a live Greenhouse/Lever/Ashby/Workday posting (real-DOM verification; fixtures pin our assumptions, not theirs). LinkedIn + SmartRecruiters are deliberate v1 non-goals.

## Tier 1 Feature 1 Shipped: Live Job Discovery

The `CanonicalJob` search index can now be populated from public career-page APIs on a schedule — the first-run empty-index gap flagged by the competitor audit is closed at the backend layer. Details:

- **4 connectors** — Greenhouse (`boards-api.greenhouse.io`), Lever (`api.lever.co`), Ashby (`api.ashbyhq.com`), RemoteOK (firehose). Registered under `apps/server/src/services/source-connectors/`.
- **Source poller** — `pollSource` fetches one registry row, ingests each job via the widened `IngestionService.ingestJob` (`api_connector` sourceType, `extractionConfidence 0.9`, no LLM at poll time), then updates `lastPolledAt`, `errorCount`, and trust score. `pollDueSources` runs the batch with concurrency cap 5 and circuit-breaks a source after 5 consecutive failures. `runWithConcurrency` pool is local, no new npm dependency.
- **Admin surface** — `POST /api/v1/admin/seed-sources` and `POST /api/v1/admin/poll-due-sources`, both behind an `x-admin-key` shared secret (`SOURCE_POLL_ADMIN_KEY` env var). Zod validates `companyId` shape to prevent malformed tokens.
- **Bootstrap data + CLI** — `data/seed-companies.json` (~23 known Greenhouse / Lever / Ashby tokens plus the RemoteOK firehose row) and `scripts/seed-sources.mjs`.
- **Scheduled runner** — `.github/workflows/poll-sources.yml` triggers `poll-due-sources` every 6 hours once the backend is deployed.
- **Race fix uncovered by the e2e test** — `IngestionService.ensureDefaultSources` now uses an atomic upsert instead of `findOne → create`, so concurrent pollers don't hit the unique-name index.
- **New tests**: 12 connector tests, 5 ingestion-connector tests, 10 source-poller tests, 4 seed tests, 7 admin-route tests, 2 e2e tests. Suite grew from 77 → 117 server tests.

What the poller intentionally does **not** do: parse the JD with the LLM. Cost is bounded to user view-time — the client's existing "Parse JD with AI" flow on the Jobs page handles that when the user actually engages with a canonical job.

## Summary

JobTailor is an advanced MVP. The resume tailoring loop, job search engine, profile management, session handling, and the full application tracker workflow are operational end-to-end.

Verified:

```bash
npm run typecheck  ✅ (3/3 packages)
npm run test       ✅ (server 117+ tests across 15 files, client 2 smoke; one pre-existing
                             search-engine L2 test times out due to live OpenAI latency,
                             not a code regression — see plan execution notes)
npm run build      ✅
```

## Completed

- Monorepo with client, server, shared types, and deploy configs.
- **Robust Session & JWT Auth**: Register, login, logout, current-user endpoints, automated silent token refresh (HttpOnly cookie), and a global re-login popup overlay protecting unsaved user modifications.
- MongoDB models for users, profiles, jobs, resumes, and applications.
- **Master Profile CRUD**: Full CRUD support for skills, experience, projects, education, and certifications.
- Manual JD entry and OpenAI JD parsing.
- Tailored resume generation from profile and parsed JD.
- ATS score breakdown with matched, missing, weak skills, and action items.
- Dashboard, profile, jobs, resume tailor, tracker, analytics, and interview mode pages.
- Rate limiting, validation, error handling, CORS, Helmet.
- TypeScript and production build passing.
- **Advanced Job Search Engine (Sprints 1–4 Complete)**:
  - Unified URL ingestion crawler and copy-paste pipeline.
  - Multi-level deduplication (L1 exact URL, L2 company/title, L3 text hash similarity).
  - In-memory deterministic relevance ranking (exact title, company, trust, freshness boosting).
  - Personalized profile skills match boosts and synonym expansion.
  - Saved-search queries and notification alert dispatcher.
  - Dynamic user-facing alerts inbox and saved alerts management settings.
  - Stale job database cleanup deactivation scheduler.
  - Personalized discover feed (skills + watches) with tracker exclusions.
  - Custom Keyword Watches (companies and titles) triggering automatic alerts.
  - Batch "read all" alert lifecycle controls.
  - Verification state tracking (`unverified | verified | failed | suspicious`) on canonical jobs.
  - Async URL health pings with source trust decay.
  - `SearchQueryLog` and `JobInteractionLog` analytics storage in MongoDB.
  - Failed and suspicious jobs excluded from search index and curated feeds.
  - Quality Dashboard UI: source trust audit, verification breakdown, query metrics, manual check trigger.
- **MVP Workflow (Sprint 5 Complete)**:
  - Application creation flow: `POST /applications`, `CreateApplicationModal`, and Kanban board wired.
  - PDF export: `generatePDF` service, `POST /resumes/:id/pdf` endpoint, download buttons on tailor page and tracker.
  - Outcome recording: `PATCH /applications/:id/outcome` with `callbackReceived`, `rejectedReason`, `offerAmount` and timeline events.
  - Reminder completion: `PATCH /applications/:id/reminders/:rid/complete` marks done with timeline event.
  - Tracker Outcomes tab: callback toggle, rejection reason, offer details, and reminders list with Mark Complete.
  - Analytics fixed: `interviewRate` and `offerRate` derived from application status (not the dead `callbackReceived` path). `resumePerformance.callbackRate` uses status too.
  - Analytics KPIs extended: added Offer Rate tile, renamed Interview Rate label.
  - **Interview Mode Integration**: A dedicated "Interview Mode" button in the application details modal and direct shortcut links on Kanban cards in the Interview stage to open the pre-loaded split-screen context screen.
- **UI Gaps Surfaced (Sprint 6 Complete)**:
  - **Manual Resume Editing**: Edit tailored summary directly from the expanded Resume Card in `ResumeTailorPage.tsx` with dynamic save triggering `PUT /resumes/:id`.
  - **Reusable Resume Selection**: Automatically queries `GET /resumes/reuse` to pre-populate default tailored resume selection dropdown in tracker card creation modal.
  - **Attach Resume to Job**: Exposes inline Link Resume selectors on the `JobsPage` details view calling `PATCH /jobs/:id/attach-resume`.
  - **Crawl Source Registration**: Exposes a "Register Source" form modal and trigger in the health matrix panel calling `POST /search/sources`.
- **Test Suite**: 215 tests — 187 server across 28 files (search engine, auth/HTTP-auth, security utils, profile/application workflows, ATS scoring v2 + golden regression + schema persistence, keyword scorer, skill IDF, score cache, rescore, live-discovery connectors/poller/seed/admin, API keys + extension flow, error correlation) + 26 extension (manifest, platform registry, detector/extractor fixtures) + 2 client smoke tests.

## Partially Done

- Resume tailoring: summary rewrite, bullet prioritization, project selection exist; deeper skill relevance ordering is basic.
- ATS scoring: engine v2 (2026-09-27) — synonym-aware graded-credit keyword phase, IDF distinctiveness weighting, golden-score regression fixtures, score cache, `POST /resumes/:id/rescore`. Remaining gap: calibration against real application outcomes.
- Analytics: outcome metrics now meaningful; deeper cohort analysis and time-series views not built.
- Profile: project tag editing is functional and uses visual tag inputs.

## Remaining MVP Work

> The authoritative, prioritized list is [TODO_PLAN.md](./TODO_PLAN.md). The items below are the small residual gaps noted during the MVP build; the roadmap there supersedes and expands them.

1. **Tag editing visual enhancements**
   - Further CSS style matching for custom tag layouts.

2. **Add more mock tests**.
   - Edge case crawler failure scenarios.

Largest strategic gaps (from the competitor audit): empty search index at first run, no browser extension for auto-tracking/capture, single resume template, no cover letter. See TODO_PLAN.md Tiers 1–2.

## Out Of Scope For MVP

- Auto-apply bots
- LinkedIn/Indeed scraping
- Interview prep generator
- Salary negotiation AI
- Team or enterprise features

## Feature Status Matrix

| Area                             | Planned / In Scope                               | Present in Code | User Can Access via UI | Notes                                                                  |
| -------------------------------- | ------------------------------------------------ | --------------: | ---------------------: | ---------------------------------------------------------------------- |
| Authentication                   | Register, login, refresh, logout, current user   |             Yes |                    Yes | Works through `LoginPage`, `RegisterPage`, and silent refresh handling |
| Dashboard                        | Main landing dashboard                           |             Yes |                    Yes | `DashboardPage` is present                                             |
| Profile basics                   | Skills, experience, projects                     |             Yes |                    Yes | Fully editable in `ProfilePage`                                        |
| Profile education                | Education CRUD                                   |             Yes |                    Yes | Fully functional in `ProfilePage` tabs                                 |
| Profile certifications           | Certification CRUD                               |             Yes |                    Yes | Fully functional in `ProfilePage` tabs                                 |
| Job creation                     | Manual JD entry                                  |             Yes |                    Yes | `JobsPage` / job route UI                                              |
| Job parsing                      | AI JD parsing                                    |             Yes |                    Yes | Accessible through job/resume workflows                                |
| Resume tailoring                 | Tailored resume generation                       |             Yes |                    Yes | `ResumeTailorPage`                                                     |
| ATS scoring                      | Match score, missing skills, action items        |             Yes |                    Yes | Visible in tailor flow and resume views                                |
| PDF export                       | Generate and download resume PDF                 |             Yes |                    Yes | Available from tracker and tailor pages                                |
| Application tracker              | Create application, Kanban board, status updates |             Yes |                    Yes | `TrackerPage` and `CreateApplicationModal`                             |
| Tracker outcomes                 | Callback, rejection reason, offer details        |             Yes |                    Yes | Outcomes tab is in the detail modal                                    |
| Reminder completion              | Mark reminders complete                          |             Yes |                    Yes | In tracker modal                                                       |
| Interview mode page              | Split interview preparation page                 |             Yes |                    Yes | Fully wired via Detail Modal and Kanban card links                     |
| Analytics dashboard              | KPI tiles and metrics                            |             Yes |                    Yes | `AnalyticsPage`                                                        |
| Search engine ingestion          | URL ingestion and paste ingestion                |             Yes |                    Yes | Accessible via Jobs search page                                        |
| Search deduplication             | L1/L2/L3 dedupe                                  |             Yes |   No direct UI control | Internal pipeline behavior                                             |
| Search ranking                   | Relevance ranking, skill match boosts            |             Yes |                    Yes | Visible through search results                                         |
| Saved searches                   | Save search criteria                             |             Yes |                    Yes | Search alerts/settings UI                                              |
| Alerts inbox                     | User alerts and unread state                     |             Yes |                    Yes | Present in jobs/search UI                                              |
| Watches                          | Custom company/title watches                     |             Yes |                    Yes | Exposed in search settings UI                                          |
| Discover feed                    | Curated feed                                     |             Yes |                    Yes | Search/discovery area                                                  |
| Cleanup / stale job verification | Link checks, stale deactivation                  |             Yes |                    Yes | Triggered from jobs/search quality UI                                  |
| Quality dashboard                | Source trust, verification, metrics              |             Yes |                    Yes | In `JobsPage` quality dashboard tab                                    |
| Manual Resume Editing            | Edit tailored summary content                    |             Yes |                    Yes | Editable from Resume Card inside ResumeTailorPage                      |
| Reusable Resume Lookup           | Automatically fetch recent resume                |             Yes |                    Yes | Pre-populates default option in Tracker modal                          |
| Attach Resume to Job             | Link tailored resume to ingestion job            |             Yes |                    Yes | Embedded selector inside Job detail panel                              |
| Create Search Source             | Form to add crawler registry sources             |             Yes |                    Yes | Registered from Quality Dashboard matrix header                        |
| Test coverage                    | Integration tests for search/workflow            |             Yes |                     No | Internal verification only                                             |

## Honest Completion Estimate

| Area                  | Completion |
| --------------------- | ---------- |
| Project setup         | 95%        |
| Auth & Sessions       | 95%        |
| Profile               | 92%        |
| JD Ingestion / Search | 95%        |
| Resume tailoring      | 85%        |
| ATS scoring           | 85%        |
| Application tracker   | 95%        |
| PDF export            | 90%        |
| Analytics             | 75%        |
| Tests                 | 80%        |

Overall MVP completion: approximately **91%**.
