# JobTailor

**Smart resume and job application tracker for developers who apply to 10+ jobs/day**

![Status: Advanced MVP](https://img.shields.io/badge/status-Advanced%20MVP-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6)
![React](https://img.shields.io/badge/React-19-61dafb)
![Node.js](https://img.shields.io/badge/Node.js-22-339933)
![MongoDB](https://img.shields.io/badge/MongoDB-8.0-47a248)

## What Is JobTailor?

JobTailor is a personal job application workspace. Paste a job description, parse its requirements, generate a tailored resume from a master profile, score the ATS match, and track the application.

The current repo is an **advanced MVP**: the full apply-and-track loop, the job search engine, profile management, session handling, PDF export, and analytics are operational end-to-end. It is not yet product-hardened (see [TODO_PLAN.md](./TODO_PLAN.md) for the prioritized gap list).

## Working Loop (end-to-end)

```text
Create job -> Parse JD -> Generate tailored resume -> View ATS score and gaps
-> Export PDF -> Create application -> Track follow-up -> Record outcome -> Analyze performance
```

The job search engine (URL/paste ingestion, dedup, ranking, saved searches, alerts, watches, curated feed, source-trust verification) sits in front of this loop and feeds it.

## Tech Stack

| Layer          | Technology                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------- |
| Frontend       | React 19 + Vite 6 + TypeScript                                                                  |
| UI             | TailwindCSS + Lucide Icons                                                                      |
| State          | Zustand + TanStack Query                                                                        |
| Backend        | Node.js + Express + TypeScript                                                                  |
| Database       | MongoDB + Mongoose                                                                              |
| Auth           | JWT + bcryptjs                                                                                  |
| LLM            | Multi-provider (OpenAI / Google Gemini / NVIDIA NIM) with fallback via a provider manager       |
| PDF Generation | Puppeteer service, wired to `POST /resumes/:id/pdf`                                             |
| File Storage   | Cloudinary service support exists                                                               |
| Browser Ext.   | Chrome MV3 (TypeScript + esbuild) — auto-track applications from Greenhouse/Lever/Ashby/Workday |
| Monorepo       | Turborepo                                                                                       |

Note: shadcn/ui is not currently installed as a component system.

## Project Structure

```text
job-tailor/
  apps/
    client/          React frontend (14 pages, 6 shared components)
    server/          Express backend (15 models, 9 route groups, source connectors + poller)
    extension/       Chrome MV3 auto-track extension (detectors/extractors per platform)
  packages/
    shared-types/    Shared TypeScript definitions
  docs/              Architecture, API, sprint, and design docs
  MVP_STATUS.md      Current completion and pending work
  TODO_PLAN.md       Prioritized roadmap (P0–P15, competitor-informed)
```

## Quick Start

### Prerequisites

- Node.js >= 18
- npm >= 9
- MongoDB connection string
- At least one AI provider API key (OpenAI, Google Gemini, or NVIDIA NIM) for JD parsing, resume tailoring, and ATS semantic scoring

### Setup

```bash
npm install
cp .env.example apps/server/.env
cp apps/client/.env.example apps/client/.env.client
npm run dev
```

Development URLs:

- Frontend: http://localhost:5173
- Backend API: http://localhost:5000
- Health check: http://localhost:5000/health

## Commands

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run test
```

Current verification baseline (2026-09-27, single source of truth):

```bash
npm run typecheck   # 4/4 tasks
npm run lint        # 3/3 tasks, 0 errors
npm run test        # 190 tests: 162 server (22 files) + 26 extension (3 files) + 2 client
npm run test:coverage --workspace=job-tailor-server
                    # 67.3% stmts / 69.1% branch / 74.2% funcs — above the 50/60/60 floor
```

All suites are hermetic: tests use `mongodb-memory-server` and stub AI providers, so they
pass identically with or without real API keys in `apps/server/.env`.

The test suite covers auth, profile CRUD concurrency, jobs, resume generation, ATS scoring math, the full application workflow, the search engine (ingestion, dedup, ranking, alerts, watches, feed, trust decay), live job discovery connectors/poller, API-key auth + extension flow, and security utilities.

## Development Phases

| Phase | Status  | Description                                                    |
| ----- | ------- | -------------------------------------------------------------- |
| 0     | Done    | Architecture, schema, API plan                                 |
| 1     | Done    | Monorepo scaffold and configs                                  |
| 2     | Done    | Express, MongoDB, auth foundation                              |
| 3     | Done    | Core models and first-pass APIs                                |
| 4     | Done    | Frontend routing, layout, auth pages                           |
| 5     | Done    | Dashboard and master profile UI                                |
| 6     | Done    | Job ingestion and resume tailor UI                             |
| 7     | Done    | Application tracker CRM                                        |
| 8     | Done    | PDF service wired and interview mode                           |
| 9     | Partial | Polish, docs, deployment config (production deploy unverified) |

Beyond the base phases, the search engine (Sprints 1–4), MVP workflow (Sprint 5), UI gap closure (Sprint 6), live job discovery (Tier 1 #1), and the Chrome auto-track extension (Tier 1 #2) are complete — see [MVP_STATUS.md](./MVP_STATUS.md).

## Documentation

- [Prioritized roadmap](./TODO_PLAN.md)
- [MVP status](./MVP_STATUS.md)
- [System design](./docs/system-design.md)
- [Architecture](./docs/architecture.md)
- [API reference](./docs/api-reference.md)
- [AI/JD analysis architecture](./docs/ai-jd-analysis-architecture.md)
- [ATS scoring technical design](./docs/ats-scoring-technical-design.md)
- [Development guide](./docs/development-guide.md)

## License

MIT
