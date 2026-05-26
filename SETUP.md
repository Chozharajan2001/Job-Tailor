# JobTailor — Quick Start Guide

## Prerequisites

- **Node.js** >= 18 (recommend 22+)
- **npm** >= 9
- **MongoDB Atlas** account (free tier) — or local MongoDB
- **OpenAI API key** — for JD parsing and resume tailoring (optional, can skip for dev)

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

| Variable | Required | Notes |
|----------|----------|-------|
| `MONGODB_URI` | Yes | Your MongoDB connection string |
| `JWT_SECRET` | Yes | Generate: `openssl rand -base64 32` |
| `JWT_REFRESH_SECRET` | Yes | Generate another one |
| `OPENAI_API_KEY` | Recommended | For JD parsing & resume tailoring |
| `CLOUDINARY_*` | Optional | For PDF storage (can skip locally) |

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
│   ├── pages/           # Route page components
│   ├── components/ui/   # shadcn/ui primitives
│   ├── components/layout/# App layout (sidebar, navbar)
│   ├── stores/          # Zustand state stores
│   ├── services/        # API client, auth service
│   └── types/           # TypeScript definitions
│
├── server/src/
│   ├── models/          # Mongoose schemas (6 collections)
│   ├── services/        # Business logic (JD parser, ATS, resume tailor)
│   ├── controllers/     # Request handlers
│   ├── routes/          # Express route definitions (+ Zod validation)
│   ├── middleware/      # Auth, error handling, validation
│   └── config/          # DB connection, env config
│
└── packages/shared-types/  # Shared TS interfaces (client ↔ server)
```

## 6. Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both client + server in dev mode |
| `npm run build` | Build all workspace packages |
| `npm run lint` | Lint all packages |
| `npm run typecheck` | Type-check all packages |
| `cd apps/server && npm run dev` | Backend only |
| `cd apps/client && npm run dev` | Frontend only |

## 7. Troubleshooting

| Issue | Fix |
|-------|-----|
| MongoDB connection refused | Ensure MongoDB is running or check `MONGODB_URI` in `.env` |
| JWT errors after restart | Tokens use `JWT_SECRET` — must be consistent across sessions |
| JD parsing fails (502) | Check `OPENAI_API_KEY` is set and has credits |
| PDF generation fails | Puppeteer needs Chrome/Chromium installed (included in Docker image) |
| Port already in use | Change `PORT=5001` in `.env` or kill existing process |

## 8. Production Deployment

### Frontend (Vercel)
- Push to GitHub → Import project in Vercel
- Set env var: `VITE_API_BASE_URL=https://your-api.render.com/api/v1`
- Auto-deploys from `main` branch

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
