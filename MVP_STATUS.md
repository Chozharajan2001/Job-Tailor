# JobTailor MVP Status

> Last updated: 2026-07-03 (Release & UI Wiring complete)

## Summary

JobTailor is an advanced MVP. The resume tailoring loop, job search engine, profile management, session handling, and the full application tracker workflow are operational end-to-end.

Verified:

```bash
npm run typecheck  ✅
npm run test       ✅ (48 tests, 5 test files)
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
- **Test Suite**: 48 integration tests (36 search engine, 6 auth, 4 jobs, 2 resumes) + 7 profile tests + 2 client smoke tests covering all main routes, schemas, and UI mounting.

## Partially Done

- Resume tailoring: summary rewrite, bullet prioritization, project selection exist; deeper skill relevance ordering is basic.
- ATS scoring: useful heuristic exists; true TF-IDF and robust semantic evaluation are not production-grade yet.
- Analytics: outcome metrics now meaningful; deeper cohort analysis and time-series views not built.
- Profile: project tag editing is functional and uses visual tag inputs.

## Remaining MVP Work

1. **Tag editing visual enhancements**
   - Further CSS style matching for custom tag layouts.

2. **Add more mock tests**.
   - Edge case crawler failure scenarios.

## Out Of Scope For MVP

- Auto-apply bots
- LinkedIn/Indeed scraping
- Interview prep generator
- Salary negotiation AI
- Team or enterprise features

## Feature Status Matrix

| Area | Planned / In Scope | Present in Code | User Can Access via UI | Notes |
|---|---|---:|---:|---|
| Authentication | Register, login, refresh, logout, current user | Yes | Yes | Works through `LoginPage`, `RegisterPage`, and silent refresh handling |
| Dashboard | Main landing dashboard | Yes | Yes | `DashboardPage` is present |
| Profile basics | Skills, experience, projects | Yes | Yes | Fully editable in `ProfilePage` |
| Profile education | Education CRUD | Yes | Yes | Fully functional in `ProfilePage` tabs |
| Profile certifications | Certification CRUD | Yes | Yes | Fully functional in `ProfilePage` tabs |
| Job creation | Manual JD entry | Yes | Yes | `JobsPage` / job route UI |
| Job parsing | AI JD parsing | Yes | Yes | Accessible through job/resume workflows |
| Resume tailoring | Tailored resume generation | Yes | Yes | `ResumeTailorPage` |
| ATS scoring | Match score, missing skills, action items | Yes | Yes | Visible in tailor flow and resume views |
| PDF export | Generate and download resume PDF | Yes | Yes | Available from tracker and tailor pages |
| Application tracker | Create application, Kanban board, status updates | Yes | Yes | `TrackerPage` and `CreateApplicationModal` |
| Tracker outcomes | Callback, rejection reason, offer details | Yes | Yes | Outcomes tab is in the detail modal |
| Reminder completion | Mark reminders complete | Yes | Yes | In tracker modal |
| Interview mode page | Split interview preparation page | Yes | Yes | Fully wired via Detail Modal and Kanban card links |
| Analytics dashboard | KPI tiles and metrics | Yes | Yes | `AnalyticsPage` |
| Search engine ingestion | URL ingestion and paste ingestion | Yes | Yes | Accessible via Jobs search page |
| Search deduplication | L1/L2/L3 dedupe | Yes | No direct UI control | Internal pipeline behavior |
| Search ranking | Relevance ranking, skill match boosts | Yes | Yes | Visible through search results |
| Saved searches | Save search criteria | Yes | Yes | Search alerts/settings UI |
| Alerts inbox | User alerts and unread state | Yes | Yes | Present in jobs/search UI |
| Watches | Custom company/title watches | Yes | Yes | Exposed in search settings UI |
| Discover feed | Curated feed | Yes | Yes | Search/discovery area |
| Cleanup / stale job verification | Link checks, stale deactivation | Yes | Yes | Triggered from jobs/search quality UI |
| Quality dashboard | Source trust, verification, metrics | Yes | Yes | In `JobsPage` quality dashboard tab |
| Manual Resume Editing | Edit tailored summary content | Yes | Yes | Editable from Resume Card inside ResumeTailorPage |
| Reusable Resume Lookup | Automatically fetch recent resume | Yes | Yes | Pre-populates default option in Tracker modal |
| Attach Resume to Job | Link tailored resume to ingestion job | Yes | Yes | Embedded selector inside Job detail panel |
| Create Search Source | Form to add crawler registry sources | Yes | Yes | Registered from Quality Dashboard matrix header |
| Test coverage | Integration tests for search/workflow | Yes | No | Internal verification only |

## Honest Completion Estimate

| Area | Completion |
| --- | --- |
| Project setup | 95% |
| Auth & Sessions | 95% |
| Profile | 92% |
| JD Ingestion / Search | 95% |
| Resume tailoring | 85% |
| ATS scoring | 60% |
| Application tracker | 95% |
| PDF export | 90% |
| Analytics | 75% |
| Tests | 80% |

Overall MVP completion: approximately **91%**.
