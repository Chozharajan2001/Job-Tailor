# JobTailor — Quick Start Guide

## Prerequisites

- **Node.js** >= 18 (recommend 22+)
- **npm** >= 9
- **MongoDB Atlas** account (free tier) — or local MongoDB
- **An AI provider API key** (OpenAI, Google Gemini, or NVIDIA NIM) — for JD parsing, resume tailoring, and ATS semantic scoring. At least one provider is needed for AI features; the app runs without one but parsing/tailoring/scoring are disabled.

## 1. Clone & Install

```bash
git clone <your-repo-url> job-tailor
cd job-tailor
npm install          # Installs root + all workspace packages
```

## 2. Environment Setup

```bash
cp .env.example apps/server/.env
```

Edit `apps/server/.env` with your values:

| Variable                                                   | Required               | Notes                                                                                                                                                                                            |
| ---------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MONGODB_URI`                                              | Yes                    | Your MongoDB connection string                                                                                                                                                                   |
| `JWT_SECRET`                                               | Yes                    | Generate: `openssl rand -base64 32`                                                                                                                                                              |
| `JWT_REFRESH_SECRET`                                       | Yes                    | Generate another one                                                                                                                                                                             |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` / `NVIDIA_NIM_API_KEY` | For AI features        | At least one provider; `PREFERRED_AI_PROVIDER` selects the primary, the manager falls back across the rest                                                                                       |
| `CLOUDINARY_*`                                             | Optional               | For PDF storage (can skip locally)                                                                                                                                                               |
| `SOURCE_POLL_ADMIN_KEY`                                    | For live job discovery | Shared secret for `POST /api/v1/admin/*` (seed-sources, poll-due-sources). Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Unset = admin routes return 503 |
| `LOG_LEVEL`                                                | Optional               | Pino logger verbosity: `fatal`, `error`, `warn`, `info` (default), `debug`, `trace`                                                                                                              |

```bash
cp apps/client/.env.example apps/client/.env.client
```

## 3. Local Development

### Option A: Standard (Recommended)

**Terminal 1 — Backend:**

```bash
cd apps/server && npm run dev
# Server runs on http://localhost:5000
# Health check: http://localhost:5000/health
```

**Terminal 2 — Frontend:**

```bash
cd apps/client && npm run dev
# Client runs on http://localhost:5173
# Auto-proxies /api to backend
```

### Option B: Docker Compose

```bash
docker-compose up --build
# Starts MongoDB on :27017, Server on :5000, Client on :5173
```

## 4. First Run Flow

1. Open **http://localhost:5173**
2. **Register** an account
3. Go to **Profile** → Add skills, experience, projects
4. Go to **Jobs** → Click "Add Job" → Paste a JD → Click "Parse with AI"
5. Go to **Resume Tailor** → Select the parsed job → Click "Generate Tailored Resume"
6. View ATS score, matched/missing skills, action items
7. Go to **Tracker** → Move application through pipeline stages
8. Go to **Interview Mode** → Split-screen JD + Resume view

## 5. Project Structure Quick Reference

```
apps/
├── client/src/
│   ├── pages/           # 14 route page components
│   ├── components/      # Shared components (modals, ConfirmDialog, ErrorBoundary, SessionExpiredModal)
│   ├── components/layout/# App layout (sidebar, navbar)
│   ├── stores/          # Zustand state stores
│   ├── services/        # API client, auth service
│   └── tests/           # Client smoke tests
│
├── server/src/
│   ├── models/          # Mongoose schemas (15 collections incl. SourceRegistry, ApiKey)
│   ├── services/        # Business logic (JD parser, ATS, resume tailor, search/ingestion,
│   │                    #   source-connectors/, source-poller, ai-provider/)
│   ├── controllers/     # Request handlers (incl. admin, apikey, application-extension)
│   ├── routes/          # Express route definitions (+ Zod validation)
│   ├── middleware/      # JWT auth, api-key auth, admin key, error handling, validation
│   ├── tests/           # Server test suites (mongodb-memory-server; no external deps)
│   ├── data/            # seed-companies.json (live job discovery bootstrap)
│   ├── scripts/         # seed-sources.mjs (idempotent source bootstrap)
│   └── config/          # DB connection, env config
│
├── extension/src/       # Chrome MV3 auto-track extension (Plan 2)
│   ├── platform-registry.ts  # URL → platform detection (Greenhouse/Lever/Ashby/Workday)
│   ├── detectors/       # Per-platform page detectors (DOM-agnostic signals)
│   ├── extractors/      # Per-platform draft extractors (textContent only)
│   ├── content/         # Content script (observer + single DETECTED signal per tab)
│   ├── background/      # Service worker (sole network + api-key holder, badge state)
│   ├── popup/           # One-tap confirm/dismiss UI
│   └── options/         # Server URL, api-key connect, per-platform toggles
│
└── packages/shared-types/  # Shared TS interfaces (client ↔ server)
```

## 6. Available Scripts

| Command                              | Description                                                |
| ------------------------------------ | ---------------------------------------------------------- |
| `npm run dev`                        | Start both client + server in dev mode                     |
| `npm run build`                      | Build all workspace packages                               |
| `npm run lint`                       | Lint all packages (server, client, extension)              |
| `npm run typecheck`                  | Type-check all packages                                    |
| `npm test`                           | Run every workspace test suite (server, client, extension) |
| `cd apps/server && npm run dev`      | Backend only                                               |
| `cd apps/client && npm run dev`      | Frontend only                                              |
| `cd apps/extension && npm run build` | Bundle the Chrome extension (esbuild → `dist/`)            |
| `cd apps/extension && npm run dev`   | Rebuild the extension on file changes                      |

**Verification baseline (2026-09-27):** `npm run typecheck` 4/4 tasks · `npm run lint` 3/3 tasks,
0 errors · `npm test` 190 tests (162 server / 26 extension / 2 client) · server coverage
67.3% stmts, above the declared 50/60/60 floor. Suites are hermetic (in-memory Mongo, stubbed
AI providers) — they pass with or without real API keys.

## 7. Troubleshooting

| Issue                      | Fix                                                                  |
| -------------------------- | -------------------------------------------------------------------- |
| MongoDB connection refused | Ensure MongoDB is running or check `MONGODB_URI` in `.env`           |
| JWT errors after restart   | Tokens use `JWT_SECRET` — must be consistent across sessions         |
| JD parsing fails (502)     | Check `OPENAI_API_KEY` is set and has credits                        |
| PDF generation fails       | Puppeteer needs Chrome/Chromium installed (included in Docker image) |
| Port already in use        | Change `PORT=5001` in `.env` or kill existing process                |

## 8. Production Deployment

### Frontend (Vercel)

- Push to GitHub → Import project in Vercel
- Set env var: `VITE_API_BASE_URL=https://your-api.render.com/api/v1`
- Auto-deploys from the `master` branch (the repository's only branch)

### Backend (Render/Railway)

- Push to GitHub → Connect to Render
- Use `render.yaml` for configuration
- Set all environment variables in Render dashboard
- Or deploy via Docker: `docker build -f apps/server/Dockerfile .`

### Database

- **MongoDB Atlas** free tier (recommended for production)
- Or self-hosted MongoDB on Railway/Render add-on

---

**Need help?** Check `docs/architecture.md` for full system design, or open an issue.
