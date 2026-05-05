# JobTailor

**Smart Resume & Job Application Tracker for Developers who apply to 10+ jobs/day**

![Phase: Architecture Complete](https://img.shields.io/badge/phase-0%20--%201-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6) ![React](https://img.shields.io/badge/React-19-61dafb) ![Node.js](https://img.shields.io/badge/Node.js-22-339933) ![MongoDB](https://img.shields.io/badge/MongoDB-8.0-47a248)

---

## What is JobTailor?

JobTailor is your personal **Job Application OS**. Paste any job description (JD) → it parses requirements → auto-generates a tailored resume from your master profile → scores ATS match → highlights skill gaps → saves everything together.

### Core Value
1. **Apply 10x faster**: JD → tailored resume → applied in **under 3 minutes**
2. **Never lose context**: Every application stores JD + resume + company + status + notes
3. **Get interviews**: ATS score + weakness box tells you exactly what to fix
4. **Learn from data**: See which resume versions get callbacks vs rejections

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite 6 + TypeScript 5.8 |
| UI | TailwindCSS + shadcn/ui + Lucide Icons |
| State | Zustand + TanStack Query v5 |
| Backend | Node.js 22 + Express 4 + TypeScript |
| Database | MongoDB Atlas + Mongoose 8 |
| Auth | JWT + bcryptjs |
| LLM | OpenAI API (JD parsing, resume tailoring) |
| PDF Generation | Puppeteer |
| File Storage | Cloudinary |
| Monorepo | Turborepo |

---

## Project Structure

```
job-tailor/
├── apps/
│   ├── client/          # React frontend (Vite)
│   └── server/          # Express backend (Node.js)
├── packages/
│   └── shared-types/    # Shared TypeScript definitions
├── docs/                # Architecture & API docs
└── turbo.json           # Turborepo configuration
```

## Quick Start

### Prerequisites
- Node.js >= 18
- npm >= 9
- MongoDB Atlas account (free tier)
- OpenAI API key

### Setup

```bash
# 1. Clone and install
git clone <repo-url>
cd job-tailor
npm install

# 2. Configure environment
cp .env.example apps/server/.env
# Edit .env with your MongoDB URI, JWT secrets, and API keys

# 3. Start development servers
npm run dev
```

This will start:
- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend API: [http://localhost:5000](http://localhost:5000)
- Health check: http://localhost:5000/health

### Available Commands

```bash
npm run dev          # Start both client + server in dev mode
npm run build        # Build all packages
npm run lint         # Lint everything
npm run typecheck    # Type-check everything
npm run test         # Run tests
```

## Development Phases

| Phase | Status | Description |
|-------|--------|-------------|
| 0 | Done | System architecture, DB schema, API contracts |
| 1 | In Progress | Project scaffold, monorepo setup, configs |
| 2 | Pending | Backend foundation — Express, MongoDB, auth system |
| 3 | Pending | Core models + APIs — Profile, Jobs, Resumes, ATS |
| 4 | Pending | Frontend shell — Routing, layout, auth flow |
| 5 | Pending | Dashboard + Master Profile UI |
| 6 | Pending | Job ingestion + Resume tailor UI |
| 7 | Pending | Application tracker CRM (Kanban) |
| 8 | Pending | PDF export + Interview mode |
| 9 | Pending | Polish, error handling, deployment |

See [docs/architecture.md](./docs/architecture.md) for full design documentation.
See [docs/api-reference.md](./docs/api-reference.md) for complete API reference.
See [docs/development-guide.md](./docs/development-guide.md) for coding conventions.

---

## License

MIT © Chozharajan M
