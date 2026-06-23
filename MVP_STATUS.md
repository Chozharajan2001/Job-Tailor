# JobTailor MVP Status

> Last updated: 2026-06-23 (Sprint 5 complete)

## Summary

JobTailor is an advanced MVP. The resume tailoring loop, job search engine, and now the full application tracker workflow are operational end-to-end.

Verified:

```bash
npm run typecheck  ✅
npm run test       ✅ (41 tests, 4 test files)
npm run build      ✅
```

## Completed

- Monorepo with client, server, shared types, and deploy configs.
- JWT auth with register, login, refresh, logout, and current-user endpoint.
- MongoDB models for users, profiles, jobs, resumes, and applications.
- Master profile API for skills, experience, and projects.
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
- **Test Suite**: 41 integration tests (34 search engine + 7 workflow) covering ingestion, dedupe, ranking, cleanup, alert controllers, watches, feeds, trust decay, flagging, analytics aggregation, outcome recording, reminder completion, and rate computation.

## Partially Done

- Master Profile UI: skills, experience, and projects are present; education is display-only, certifications not surfaced.
- Resume tailoring: summary rewrite, bullet prioritization, project selection exist; deeper skill relevance ordering is basic.
- ATS scoring: useful heuristic exists; true TF-IDF and robust semantic evaluation are not production-grade yet.
- Tracker: Kanban board, drag/drop, creation, outcomes, reminders all work; interview mode link from card not wired.
- Analytics: outcome metrics now meaningful; deeper cohort analysis and time-series views not built.

## Remaining MVP Work

1. **Tighten profile workflows.**
   - Education CRUD
   - Certification CRUD
   - Better project tag editing
   - Stronger update validation schemas

2. **Interview mode link from tracker card.**
   - "Open interview mode" button on application card opening split view pre-loaded with job context

3. **Add tests.**
   - Auth API tests
   - Job CRUD and parse route tests
   - Resume generation tests with mocked OpenAI
   - Client smoke tests for major pages

## Out Of Scope For MVP

- Auto-apply bots
- LinkedIn/Indeed scraping
- Interview prep generator
- Salary negotiation AI
- Team or enterprise features

## Honest Completion Estimate

| Area | Completion |
| --- | --- |
| Project setup | 90% |
| Auth | 80% |
| Profile | 60% |
| JD Ingestion / Search | 95% |
| Resume tailoring | 65% |
| ATS scoring | 60% |
| Application tracker | 85% |
| PDF export | 85% |
| Analytics | 75% |
| Tests | 60% |

Overall MVP completion: approximately **85%**.
