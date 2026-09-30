# ============================================

# JobTailor — Development Guide & Conventions

# Last reconciled with the tree: 2026-09-27

# ============================================

## 1. Development Workflow (Git Flow)

### Branch Strategy

**Actual practice:** the repository has a single `master` branch. Work lands via direct
conventional commits; CI (`.github/workflows/ci.yml`) gates every push with typecheck,
lint, build, all-workspace tests, and the server coverage floor. Pushes to GitHub pass an
L3 deep security review gate first.

**Aspiration (not yet adopted)** — if multi-contributor work starts, move to:

```
main                    ← Production-ready, protected
  ├── develop           ← Integration branch
  │     ├── feature/*   ← New features (e.g., feature/jd-parser)
  │     ├── fix/*       ← Bug fixes
  │     └── chore/*     ├── Config, deps, docs
```

The CI workflow already triggers on `main`/`master` pushes and all pull requests, so
adopting this model needs no workflow change.

### Commit Message Convention (Conventional Commits)

```
feat: add JD parsing endpoint with OpenAI integration
fix: resolve ATS score calculation overflow for edge cases
docs: update API reference for auth endpoints
refactor: extract resume service from controller
style: format codebase with prettier
test: add unit tests for profile CRUD operations
chore: upgrade dependencies to latest versions
```

### Commit Checklist Before Push

- [ ] No `console.log` left in production code (ESLint `no-console` warns; Pino logger instead)
- [ ] No hardcoded secrets or keys
- [ ] TypeScript compiles without errors (`npm run typecheck`)
- [ ] Linter passes (`npm run lint`)
- [ ] Tests pass (`npm test` — all workspaces)
- [ ] Commit message follows conventional format (commitlint enforces; body lines ≤ 100 chars)

---

## 2. Code Style & Conventions

### TypeScript Rules

- Use **interfaces** for object shapes, **types** for unions/intersections
- Avoid `any` — use `unknown` and type narrowing
- Use `strict: true` in tsconfig
- Prefer `const` assertions for literal objects
- Return explicit types from public functions

### Naming Conventions

| Category            | Convention                | Example                           |
| ------------------- | ------------------------- | --------------------------------- |
| Files (components)  | PascalCase                | `JobCard.tsx`, `ATSDashboard.tsx` |
| Files (utils/hooks) | camelCase                 | `useAuth.ts`, ` formatDate.ts`    |
| Components          | PascalCase                | `<KanbanBoard />`                 |
| Functions/variables | camelCase                 | `parseJD()`, `userId`             |
| Constants           | UPPER_SNAKE               | `MAX_BULLETS_PER_ROLE`            |
| Interfaces/Types    | Prefix I\_ or descriptive | `IUser`, `ParsedJD`               |
| DB collections      | Singular, Pascal          | `User`, `JobApplication`          |
| API routes          | kebab-case                | `/jobs/:id/parse-jd`              |
| Env variables       | UPPER_SNAKE               | `MONGODB_URI`                     |

### Component Structure Order

```typescript
// 1. Imports (external → internal → relative)
// 2. Types/interfaces
// 3. Constants
// 4. Component declaration
// 5. Sub-components (if small)
// 6. Hooks (useState, useEffect, custom hooks)
// 7. Event handlers
// 8. Derived values / useMemo
// 9. Effects
// 10. Render return
// 11. Export default
```

### File Size Guidelines

Enforced by ESLint at **warn** level in every workspace (`max-lines`, and
`max-lines-per-function` on the client): visible on every lint run, non-blocking for CI.
Files that predate the rule are baselined via per-file overrides in each `eslint.config.js`
(server: `auth.service`, `ingestion.service`, `email.service`, `ats-scoring.service`, and
five controllers; client: `JobsPage`, `ProfilePage`, `TrackerPage`, `ResumeTailorPage`,
`AnalyticsPage`). Shrink a baselined file below the limit → remove it from the override.

- **Components**: Max 200 lines — split if larger
- **Pages**: Max 300 lines — extract sections
- **Services/Controllers**: Max 300 lines — extract logic
- **Models**: Keep schema + interfaces together

---

## 3. Project Commands

```bash
# Install all dependencies (root)
npm install

# Development mode (both frontend + backend)
npm run dev

# Build all packages (server tsc, client Vite, extension esbuild)
npm run build

# Lint everything (server, client, extension)
npm run lint

# Type-check everything
npm run typecheck

# Tests — all workspaces via turbo (server, client, extension)
npm test
npm run test --workspace=job-tailor-server           # server only
npm run test:coverage --workspace=job-tailor-server  # coverage floor gate

# Frontend only
cd apps/client && npm run dev        # Dev server on :5173
cd apps/client && npm run build      # Production build

# Backend only
cd apps/server && npm run dev        # Dev server with tsx watch :5000
cd apps/server && npm run build      # TypeScript compile
cd apps/server && npm run start      # Run compiled JS

# Extension only
cd apps/extension && npm run build   # esbuild → dist/ (load unpacked in Chrome)
cd apps/extension && npm run dev     # rebuild on changes

# UI note
# The current client uses TailwindCSS and Lucide icons.
# A shadcn/ui component system has not been installed yet.
```

---

## 4. Environment Setup

1. Clone repo:

```bash
git clone <repo-url>
cd job-tailor
npm install
```

2. Set up environment files:

```bash
cp .env.example apps/server/.env
cp apps/client/.env.example apps/client/.env.client
# Edit both files with your actual values
```

3. Start MongoDB Atlas (free tier) or local MongoDB

4. Get API keys:
   - OpenAI (or Claude) for JD parsing + resume tailoring
   - Cloudinary account for PDF storage

5. Run:

```bash
npm run dev
```

---

## 5. Testing Strategy

| Layer           | Tool                              | What to Test                                       |
| --------------- | --------------------------------- | -------------------------------------------------- |
| Unit            | Vitest + React Testing Library    | Components, hooks, utils                           |
| Integration     | Supertest + mongodb-memory-server | API routes + database                              |
| Extension logic | Vitest (synthetic DOM fixtures)   | Detectors, extractors, registry                    |
| E2E             | Playwright (planned)              | Critical flows: login, create job, generate resume |

**Hermeticity rule:** every server test connects through `mongodb-memory-server`
(`src/tests/helpers/test-db.ts`) and AI providers are stubbed at the provider boundary.
The suite must pass identically with and without real keys in `apps/server/.env`.

Current suites (2026-09-30): server 30 files / 200 tests (auth, profile concurrency, jobs,
resumes, ATS math + golden scores, applications, search engine, source connectors + poller,
ingestion + dedup, employment-type normalising, API keys + extension flow, admin routes,
security, logger redaction, error correlation); extension 3 files / 26 tests; client 2 files /
5 tests (smoke + high-churn page gates). Server coverage floors (55 statements / 50 branches /
59 functions / 55 lines — `apps/server/vitest.config.ts:40-44`) are gated in CI via
`test:coverage`; latest measurement 56.8 / 70.0 / 61.0 / 56.8.

Run the gates with `npx turbo run typecheck lint test --force --concurrency=1`. `--force`
because turbo replays cached output by default and a replayed run proves nothing; `--concurrency=1`
because the full fan-out exhausts memory on an 8 GB machine and dies with exit 134 (a V8 native
allocation failure, not a code error).

---

## 6. Security Checklist

- [x] Passwords hashed with bcrypt (12 rounds)
- [x] Refresh token delivered only as an httpOnly cookie (`controllers/auth.controller.ts:155-160`); the access token is held in Zustand memory, never in localStorage
- [x] JWT supported through Authorization header
- [x] All inputs validated with Zod schemas (server-side)
- [x] Rate limiting on auth endpoints
- [x] CORS configured for allowed origins only
- [x] MongoDB injection protection via Mongoose schemas
- [x] API keys never exposed to client (server-side env only)
- [ ] File upload size limits for user uploads
- [x] Helmet.js security headers enabled

---

## 7. Performance Targets

| Metric                     | Target  |
| -------------------------- | ------- |
| First Contentful Paint     | < 1.5s  |
| Time to Interactive        | < 3s    |
| API response (simple CRUD) | < 200ms |
| JD parsing (LLM call)      | < 10s   |
| Resume generation          | < 15s   |
| PDF generation             | < 5s    |
