# JobTailor

**Smart resume and job application tracker for developers who apply to 10+ jobs/day**

![Status: MVP Foundation](https://img.shields.io/badge/status-MVP%20foundation-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6)
![React](https://img.shields.io/badge/React-19-61dafb)
![Node.js](https://img.shields.io/badge/Node.js-22-339933)
![MongoDB](https://img.shields.io/badge/MongoDB-8.0-47a248)

## What Is JobTailor?

JobTailor is a personal job application workspace. Paste a job description, parse its requirements, generate a tailored resume from a master profile, score the ATS match, and track the application.

The current repo is a buildable MVP foundation. It is not product-complete yet.

## Current Working Loop

```text
Create job -> Parse JD -> Generate tailored resume -> View ATS score and gaps
```

## Intended Full Loop

```text
Create job -> Parse JD -> Generate resume -> Create application -> Export PDF -> Track follow-up -> Record outcome -> Analyze performance
```

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19 + Vite 6 + TypeScript |
| UI | TailwindCSS + Lucide Icons |
| State | Zustand + TanStack Query |
| Backend | Node.js + Express + TypeScript |
| Database | MongoDB + Mongoose |
| Auth | JWT + bcryptjs |
| LLM | OpenAI API |
| PDF Generation | Puppeteer service exists, route pending |
| File Storage | Cloudinary service support exists |
| Monorepo | Turborepo |

Note: shadcn/ui is not currently installed as a component system.

## Project Structure

```text
job-tailor/
  apps/
    client/          React frontend
    server/          Express backend
  packages/
    shared-types/    Shared TypeScript definitions
  docs/              Architecture and API docs
  MVP_STATUS.md      Current completion and pending work
```

## Quick Start

### Prerequisites

- Node.js >= 18
- npm >= 9
- MongoDB connection string
- OpenAI API key for JD parsing and AI summary rewriting

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
npm run typecheck
npm run test
```

Known passing checks:

```bash
npm run typecheck
npm run build
```

Tests are not meaningful yet because no real test suite has been added.

## Development Phases

| Phase | Status | Description |
| --- | --- | --- |
| 0 | Done | Architecture, schema, API plan |
| 1 | Done | Monorepo scaffold and configs |
| 2 | Done | Express, MongoDB, auth foundation |
| 3 | Done | Core models and first-pass APIs |
| 4 | Done | Frontend routing, layout, auth pages |
| 5 | Partial | Dashboard and master profile UI |
| 6 | Partial | Job ingestion and resume tailor UI |
| 7 | Partial | Application tracker CRM |
| 8 | Partial | PDF service and interview mode |
| 9 | Partial | Polish, docs, deployment config |

## Documentation

- [MVP status](./MVP_STATUS.md)
- [Architecture](./docs/architecture.md)
- [API reference](./docs/api-reference.md)
- [Development guide](./docs/development-guide.md)

## License

MIT
