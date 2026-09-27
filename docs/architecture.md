# JobTailor Architecture

> Last updated: 2026-09-25
> Status: Advanced MVP — core workflows operational end-to-end.
> Note: this is the original architecture overview. The authoritative, code-verified descriptions now live in `docs/system-design.md`, `docs/ai-jd-analysis-architecture.md`, and `docs/ats-scoring-technical-design.md`. This file is kept as a lightweight orientation and is corrected against the repo.

## System Overview

JobTailor is a MERN-style monorepo with:

- React 19 + Vite client
- Express + TypeScript API
- MongoDB + Mongoose models
- JWT auth with silent refresh
- Multi-provider AI layer (OpenAI / Google Gemini / NVIDIA NIM) with fallback via a provider manager
- Hybrid ATS scoring (keyword + LLM semantic + completeness + format)
- Puppeteer PDF generation, wired to `POST /resumes/:id/pdf`
- Advanced job search engine (ingestion, dedup, ranking, alerts, watches, feed, source-trust verification)

Product loop (all operational):

```text
Create job -> Parse JD -> Generate tailored resume -> View ATS score and gaps
-> Export PDF -> Create application -> Track follow-up -> Record outcome -> Analyze performance
```

## Actual Repository Structure

```text
job-tailor/
  apps/
    client/
      src/
        components/
          layout/
          ErrorBoundary.tsx
          Loading.tsx
        pages/
          AnalyticsPage.tsx
          DashboardPage.tsx
          InterviewModePage.tsx
          JobsPage.tsx
          LoginPage.tsx
          ProfilePage.tsx
          RegisterPage.tsx
          ResumeTailorPage.tsx
          TrackerPage.tsx
        services/
          api.ts
          auth.ts
        stores/
          authStore.ts
        App.tsx
        main.tsx
      public/
      index.html
      package.json
      tsconfig.json
      vite.config.ts
    server/
      src/
        config/
        controllers/
        middleware/
        models/
        routes/
        services/
          ai-provider/
        tests/
        app.ts
      Dockerfile
      package.json
      render.yaml
  packages/
    shared-types/
      src/index.ts
      package.json
      tsconfig.json
  docs/
  MVP_STATUS.md
  package.json
  turbo.json
```

Not currently present:

- `components/ui` (shadcn/ui is not installed as a component system)
- shared `validations`
- shared `api-client`
- client `hooks`
- Playwright E2E tests (server and client unit/integration suites exist and pass — 79 tests)

## Backend Architecture

The API is organized by domain:

- `auth`: register, login, refresh, logout, current user, email verification, password reset
- `profile`: master resume profile — skills, experience, projects, education, certifications
- `jobs`: JD storage, parsing, attach-resume, and the search/ingestion endpoints
- `resumes`: tailored resume generation, resume CRUD, profile resume, PDF export, quick ATS check
- `applications`: Kanban-style status, notes, reminders, outcome recording, reminder completion
- `analytics`: overview, status breakdown, skill gap reports, search/interaction logs
- `search`: ingestion, saved searches, alerts inbox, watches, curated feed, cleanup, quality dashboard

Security and middleware:

- Helmet
- CORS
- `express-rate-limit`, configured inline in `app.ts`
- Zod request validation
- JWT auth middleware
- Central error handler

## Frontend Architecture

The client is a page-oriented React app:

- `App.tsx` defines public and protected routes.
- `Layout.tsx` provides sidebar navigation.
- Zustand stores auth state.
- TanStack Query handles server state.
- `api.ts` wraps fetch and returns the backend `{ success, data }` envelope.

Current pages:

- Login, Register, Forgot Password, Reset Password, Verify Email, Resend Verification
- Dashboard
- Profile
- Jobs (includes Global Search, Curated Feed, Watches, Alerts, Quality Dashboard tabs)
- Resume Tailor
- Tracker
- Analytics
- Interview Mode

## Data Model Summary

Implemented Mongoose models (13):

- Core: `User`, `Profile`, `Job`, `Resume`, `Application`
- Search engine: `CanonicalJob`, `SourceRegistry`, `SavedSearch`, `Alert`, `Watch`, `SearchQueryLog`, `JobInteractionLog`
- Audit: `AuditLog`

Model reality:

- `Resume` stores tailored skills, experience, and projects content directly, plus the embedded `atsScore` subdocument. It supports two types via `isProfileResume` (master profile resume) vs a job-linked/attached resume.
- `Job` stores raw JD text, the parsed JD result, and an optional `attachedResumeId`.
- `Application` is fully wired: create, status updates, notes, reminders, reminder completion, and outcome recording (callback / rejection reason / offer amount) with timeline events.
- `Profile` supports full CRUD for skills, experience, projects, education, and certifications through both API and UI.

## AI Services

### JD Parser

`jd-parser.service.ts` calls the AI provider manager (OpenAI / Gemini / NVIDIA NIM, whichever is configured) and expects structured JSON:

- summary
- seniority level
- focus weights
- required/preferred skills
- responsibilities
- qualifications
- nice-to-haves
- tone

Validation is Zod-enforced; results with zero required skills are rejected. Current limitation: no regex fallback or JD-text cache is implemented.

### Resume Tailor

`resume-tailor.service.ts`:

- sorts highlighted skills first
- prioritizes bullets by top JD focus tag
- selects projects by skill overlap
- optionally rewrites the summary via the provider manager (temperature ≤ 0.2, truth-bounded — no fabricated skills)
- calls ATS scoring

Current limitation: skill ordering is simple and not deeply weighted by JD relevance (roadmap Tier 3).

### ATS Scoring

`ats-scoring.service.ts` — four phases run concurrently and combine with fixed weights `keyword 0.35 + semantic 0.45 + completeness 0.12 + format 0.08`:

- keyword match (weighted token match, required 2× / preferred 1×)
- semantic score through the provider manager when available
- **degraded mode**: if the LLM semantic phase fails, the score is renormalized over the three deterministic phases (`0.55 / 0.25 / 0.20`) and flagged — a constant is never substituted. (An earlier design used a fixed fallback of 75; that was replaced because it presented false confidence.)
- section completeness and format score (the latter partly from quantified bullets)

Current limitation: this is a useful heuristic, not a production ATS simulator. See `docs/ats-scoring-technical-design.md`.

## PDF Generation

`pdf-generator.service.ts` renders resume HTML to PDF with Puppeteer and uploads to Cloudinary or returns a data URL.

It is wired end-to-end: `POST /resumes/:id/pdf` (`downloadPDF`) exposes it, with download buttons on the Resume Tailor page and the tracker. Current limitation: a single template (template library is roadmap Tier 2).

## Deployment

Deployment config exists:

- Vercel config for client
- Render config and Dockerfile for server
- MongoDB connection through env vars
- Cloudinary env vars for future PDF storage

Current limitation: production deployment has not been verified end-to-end in this codebase.

## Verification Status

Current baseline (2026-09-27, post-ATS-v2):

```bash
npm run typecheck   # 4/4 tasks (shared-types, server, client, extension)
npm run lint        # 3/3 tasks, 0 errors
npm run test        # 215 tests: 187 server (28 files) + 26 extension (3 files) + 2 client
npm run test:coverage --workspace=job-tailor-server
                    # 68.7% stmts / 71.3% branch / 75.6% funcs — above the 50/60/60 floor
```

Tests cover auth, HTTP auth flows, profile CRUD concurrency, jobs, resume generation, ATS scoring math, the application workflow, the search engine (ingestion, dedup, ranking, synonyms, alerts, watches, feed, cleanup, trust decay), live job discovery (source connectors, poller, seeding, admin routes), API-key auth and the extension flow, error correlation, and security utilities. All suites are hermetic (in-memory MongoDB, stubbed AI providers). CI runs typecheck, lint, build, all three test suites, and the server coverage floor on every push/PR (`.github/workflows/ci.yml`).

Remaining verification gap: production deployment (Vercel + Render + MongoDB Atlas) has not been exercised end-to-end, and the Chrome extension UI has not been manually verified in a real browser (load `apps/extension/dist` unpacked).
