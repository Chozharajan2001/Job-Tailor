# JobTailor Architecture

> Last updated: 2026-05-14  
> Status: Buildable MVP foundation, not product-complete.

## System Overview

JobTailor is a MERN-style monorepo with:

- React 19 + Vite client
- Express + TypeScript API
- MongoDB + Mongoose models
- JWT auth
- OpenAI-backed JD parsing and summary rewriting
- Hybrid ATS scoring
- Puppeteer PDF generation service, not yet wired to an API route

Current strongest product loop:

```text
Create job -> Parse JD -> Generate tailored resume -> View ATS score and gaps
```

Full intended product loop still pending:

```text
Create job -> Parse JD -> Generate resume -> Create application -> Export PDF -> Track follow-up -> Record outcome -> Analyze performance
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

- `components/ui`
- shared `validations`
- shared `api-client`
- client `hooks`
- server `tests`
- Playwright E2E tests

## Backend Architecture

The API is organized by domain:

- `auth`: register, login, refresh, logout, current user
- `profile`: master resume profile, skills, experience, projects
- `jobs`: JD storage and parsing
- `resumes`: tailored resume generation and resume CRUD
- `applications`: Kanban-style status, notes, reminders
- `analytics`: overview, status breakdown, skill gap reports

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

- Login
- Register
- Dashboard
- Profile
- Jobs
- Resume Tailor
- Tracker
- Analytics
- Interview Mode

## Data Model Summary

Implemented Mongoose models:

- `User`
- `Profile`
- `Job`
- `Resume`
- `Application`

Current model reality:

- `Resume` stores tailored skills, experience, and projects content directly.
- `Application` exists, but there is no create-application endpoint yet.
- `Job` stores raw JD text and parsed JD result.
- `Profile` supports certifications in the model, but there is no UI/API workflow for certification CRUD yet.

## AI Services

### JD Parser

`jd-parser.service.ts` calls OpenAI and expects structured JSON:

- summary
- seniority level
- focus weights
- required/preferred skills
- responsibilities
- qualifications
- nice-to-haves
- tone

Current limitation: no regex fallback or JD-text cache is implemented.

### Resume Tailor

`resume-tailor.service.ts`:

- sorts highlighted skills first
- prioritizes bullets by top JD focus tag
- selects projects by skill overlap
- optionally rewrites summary with OpenAI
- calls ATS scoring

Current limitation: skill ordering is simple and not deeply weighted by JD relevance.

### ATS Scoring

`ats-scoring.service.ts`:

- keyword match
- semantic score through OpenAI when configured
- fallback semantic score of `75`
- section completeness
- format score based partly on quantified bullets

Current limitation: this is a useful heuristic, not a production ATS simulator.

## PDF Generation

`pdf-generator.service.ts` can render resume HTML to PDF with Puppeteer and upload to Cloudinary or return a data URL.

Current limitation: no route/controller calls this service yet, so users cannot download PDFs through the app.

## Deployment

Deployment config exists:

- Vercel config for client
- Render config and Dockerfile for server
- MongoDB connection through env vars
- Cloudinary env vars for future PDF storage

Current limitation: production deployment has not been verified end-to-end in this codebase.

## Verification Status

Known passing checks:

```bash
npm run typecheck
npm run build
```

Known gap:

```bash
npm run test
```

The test command exists, but no meaningful tests are currently present.
