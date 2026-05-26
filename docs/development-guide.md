# ============================================
# JobTailor — Development Guide & Conventions
# ============================================

## 1. Development Workflow (Git Flow)

### Branch Strategy
```
main                    ← Production-ready, protected
  ├── develop           ← Integration branch
  │     ├── feature/*   ← New features (e.g., feature/jd-parser)
  │     ├── fix/*       ← Bug fixes
  │     └── chore/*     ├── Config, deps, docs
```

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
- [ ] No `console.log` left in production code
- [ ] No hardcoded secrets or keys
- [ ] TypeScript compiles without errors (`tsc --noEmit`)
- [ ] Linter passes (`npm run lint`)
- [ ] Tests pass (`npm run test` if applicable)
- [ ] Commit message follows conventional format

---

## 2. Code Style & Conventions

### TypeScript Rules
- Use **interfaces** for object shapes, **types** for unions/intersections
- Avoid `any` — use `unknown` and type narrowing
- Use `strict: true` in tsconfig
- Prefer `const` assertions for literal objects
- Return explicit types from public functions

### Naming Conventions
| Category | Convention | Example |
|----------|-----------|---------|
| Files (components) | PascalCase | `JobCard.tsx`, `ATSDashboard.tsx` |
| Files (utils/hooks) | camelCase | `useAuth.ts`, ` formatDate.ts` |
| Components | PascalCase | `<KanbanBoard />` |
| Functions/variables | camelCase | `parseJD()`, `userId` |
| Constants | UPPER_SNAKE | `MAX_BULLETS_PER_ROLE` |
| Interfaces/Types | Prefix I_ or descriptive | `IUser`, `ParsedJD` |
| DB collections | Singular, Pascal | `User`, `JobApplication` |
| API routes | kebab-case | `/jobs/:id/parse-jd` |
| Env variables | UPPER_SNAKE | `MONGODB_URI` |

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

# Build all packages
npm run build

# Lint everything
npm run lint

# Type-check everything
npm run typecheck

# Frontend only
cd apps/client && npm run dev        # Dev server on :5173
cd apps/client && npm run build      # Production build

# Backend only
cd apps/server && npm run dev        # Dev server with nodemon :5000
cd apps/server && npm run build      # TypeScript compile
cd apps/server && npm run start      # Run compiled JS

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

| Layer | Tool | What to Test |
|-------|------|-------------|
| Unit | Vitest + React Testing Library | Components, hooks, utils |
| Integration | Supertest | API routes + database |
| E2E | Playwright | Critical flows: login, create job, generate resume |

---

## 6. Security Checklist

- [x] Passwords hashed with bcrypt (12 rounds)
- [ ] JWT stored in http-only cookies
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

| Metric | Target |
|--------|--------|
| First Contentful Paint | < 1.5s |
| Time to Interactive | < 3s |
| API response (simple CRUD) | < 200ms |
| JD parsing (LLM call) | < 10s |
| Resume generation | < 15s |
| PDF generation | < 5s |
