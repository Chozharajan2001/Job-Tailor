# Chrome Extension Auto-Track Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Chrome MV3 extension that detects when the user submits a job application on a supported ATS (Greenhouse, Lever, Ashby, Workday), prompts "Add this to JobTailor tracker?", and — on confirm — creates both a `Job` and an `Application` on the server in one round-trip, appearing immediately on the user's Kanban board.

**Architecture:** Two deliverables shipped together as one working feature. **Server side:** a new long-lived per-user **API key** auth path (parallel to JWT for browser sessions), and one endpoint `POST /applications/from-extension` that upserts a `Job` (matched by URL, or company+title if URL is unknown), then creates an `Application(status='applied')` linked to that Job, in a single transaction-ish sequence. The endpoint is idempotent — a re-poll of the same URL reuses the existing Job and Application rather than duplicating. **Extension side:** a plain TypeScript + esbuild MV3 package under `apps/extension/` with a service worker background script, one content script per supported ATS platform (detectors + submitters + extractors), a minimal popup for the "Add / Skip / Always add" decision, and an options page for pasting the API key and toggling platforms. LinkedIn is deliberately out of scope for v1 — its apply flow is modal, multi-step, and rate-limited.

**Tech Stack:** Node 22, TypeScript 5.8, Express 5, Mongoose 8, Zod 4 on the server (all existing). Chrome Manifest V3 (chrome-extension APIs: `chrome.scripting`, `chrome.storage.sync`, `chrome.action`, `chrome.tabs`), esbuild 0.24 for the extension bundle (new workspace package), Vitest 3 with `@testing-library/dom` for content-script unit tests. No framework in the popup — plain DOM + inline styles, matches the personal-tool aesthetic.

**Spec:** This plan implements Tier 1 · Feature 2 from `TODO_PLAN.md`. Related: `docs/system-design.md` §6 (API conventions), `docs/superpowers/plans/2026-09-26-live-job-discovery.md` (source-poller pattern reused conceptually for auth).

## Global Constraints

- Node.js >= 18, npm >= 9, TypeScript strict
- All server routes return the standard `{ success, data?, error?: { code, message } }` envelope
- Zod validation on every request body / query / param
- Application model requires a `jobId` and enforces unique `(userId, jobId)` — the server-side upsert must respect that
- Extension never sends the raw JWT access token (short-lived, refresh dance is a web-app pattern); all extension → server calls use a long-lived per-user API key the user pastes into Options once
- Extension stores the API key in `chrome.storage.sync` (encrypted-at-rest by the browser), never in `localStorage`, never in URL query strings
- Every content script must be safe against CSP on the host page — no inline styles/scripts, only class-based DOM insertion and message-passing to the background worker
- Conventional Commits enforced by commitlint (`body-max-line-length: 100`)
- Typecheck clean (`npm run typecheck`) before every commit; the pre-commit hook also runs lint
- No new runtime dependency for the server side (crypto for key hashing is Node built-in); the extension package adds `chrome-types` (dev) and `esbuild` (dev) only
- Every "detected application" event must be user-initiated (popup appears first) — v1 does NOT auto-submit anything to JobTailor without an explicit click. Auto-add mode is behind a toggle the user must opt into.

## File Structure

**Server side** — extends the existing Express app:

```
apps/server/src/
├── models/
│   └── ApiKey.model.ts                       [NEW] per-user hashed key, name, lastUsedAt, revokedAt
├── middleware/
│   └── api-key-auth.ts                       [NEW] authenticate via x-api-key header, populates req.user like the JWT middleware
├── controllers/
│   ├── apikey.controller.ts                  [NEW] issue / list / revoke keys (JWT-authenticated, from the web app)
│   └── application.controller.ts             [MODIFY] add `createFromExtension` handler
├── routes/
│   ├── apikey.routes.ts                      [NEW] mounted at /api/v1/apikeys (JWT)
│   └── application.routes.ts                 [MODIFY] add unauthenticated-by-JWT route /from-extension (uses apiKeyAuth middleware)
├── services/
│   └── job-upsert.service.ts                 [NEW] findOrCreateJob(input) → Job document (URL match first, company+title fallback)
└── tests/
    ├── apikey.test.ts                        [NEW] issue, hash, authenticate, revoke, list-lastUsedAt
    ├── job-upsert.test.ts                    [NEW] URL match, company+title fallback, dedup on rapid re-upsert
    └── application-from-extension.test.ts    [NEW] 401 without key, 201 with key, 200 on re-poll, idempotency
```

**Extension side** — new workspace package:

```
apps/extension/
├── manifest.json                             static MV3 manifest (permissions, content_scripts patterns)
├── package.json                              esbuild + chrome-types, no runtime deps
├── tsconfig.json
├── esbuild.config.mjs                        builds src/background.ts, src/content/*.ts, src/popup/popup.ts, src/options/options.ts into dist/
├── src/
│   ├── types.ts                              ApplicationDraft, DetectedEvent, PlatformConfig — shared between content + background + popup
│   ├── platform-registry.ts                  single source of truth mapping a URL pattern to a detector + extractor module
│   ├── detectors/
│   │   ├── greenhouse.ts                     DOM probes: submit-button click, thank-you node, /thank-you* URL
│   │   ├── lever.ts
│   │   ├── ashby.ts
│   │   └── workday.ts
│   ├── extractors/
│   │   ├── greenhouse.ts                     parse company + title + JD body from a job-posting page
│   │   ├── lever.ts
│   │   ├── ashby.ts
│   │   └── workday.ts
│   ├── content/
│   │   └── index.ts                          content-script entry: register on this domain, watch for submit, extract, message background
│   ├── background/
│   │   └── index.ts                          service worker: listen for DETECTED messages, open popup with the draft, POST to server on user confirm
│   ├── popup/
│   │   ├── popup.html
│   │   └── popup.ts                          renders the draft, calls background with ADD / SKIP / ALWAYS_ADD_FROM_SITE
│   └── options/
│       ├── options.html
│       └── options.ts                        API-key paste field, platform toggle checkboxes, test connection button
└── tests/
    ├── platform-registry.test.ts             matcher precedence, unknown URL → null
    ├── detectors.test.ts                     one test per platform, DOM fixtures via @testing-library
    └── extractors.test.ts                    pull company/title/JD from realistic ATS HTML snippets
```

Files that change together live together: each platform has a detector and an extractor in parallel directories — adding a new site is two new files plus one registry entry.

## Interfaces

**Consumes** (existing):

- `Application` model at `apps/server/src/models/Application.model.ts` — unique `(userId, jobId)`, `status` enum includes `'applied'`
- `Job` model at `apps/server/src/models/Job.model.ts` — has `jdRawText`, `sourceUrl?`, `companyName`, `jobTitle`, `userId` fields
- `authenticate` middleware (JWT) at `apps/server/src/middleware/auth.middleware.ts:23` — same `req.user = { userId, email }` shape our API-key middleware will produce
- Existing `createApplication` handler at `apps/server/src/controllers/application.controller.ts` — we'll reuse its "record a timeline event on creation" behaviour by calling it after our upsert, or by factoring a small helper

**Produces** (server):

- `ApiKey` model + `hashApiKey(raw: string): string` (SHA-256 hex) + `generateApiKey(): { raw, hash, prefix }` — the raw is shown once; only the hash is stored
- `authenticateByApiKey(req, res, next)` middleware — sets `req.user` identically to `authenticate`
- `JobUpsertService.findOrCreateJob(userId, draft): Promise<{ job, created: boolean }>`
- `POST /api/v1/apikeys` (JWT) → `{ key: "jtk_<40 hex>", id, prefix, createdAt }` — the raw is returned once
- `GET /api/v1/apikeys` (JWT) → list without raw values
- `DELETE /api/v1/apikeys/:id` (JWT) → revokes (soft-delete via `revokedAt`)
- `POST /api/v1/applications/from-extension` (x-api-key) → `{ success, data: { jobId, applicationId, jobCreated, applicationCreated } }`

**Produces** (extension):

- `PlatformConfig { id: 'greenhouse'|'lever'|'ashby'|'workday', urlMatch: RegExp, detector: Detector, extractor: Extractor }`
- `ApplicationDraft { platform, jobIdHint, sourceUrl, companyName, jobTitle, jdRawText, detectedAt }`
- `messageTypes` shared constants: `DETECTED`, `USER_CONFIRMED_ADD`, `USER_SKIPPED`, `ALWAYS_ADD_TOGGLE`

---

## Task 1: ApiKey model + hashing helpers

**Files:**

- Create: `apps/server/src/models/ApiKey.model.ts`
- Create: `apps/server/src/utils/api-key.ts`
- Test: `apps/server/src/tests/apikey.test.ts`

**Interfaces:**

- Produces: `IApiKeyDocument` with `userId`, `name`, `keyHash`, `prefix`, `lastUsedAt`, `revokedAt`
- Produces: `generateApiKey(): { raw: string; hash: string; prefix: string }`, `hashApiKey(raw: string): string`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/server/src/tests/apikey.test.ts
import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey } from "../utils/api-key.js";

describe("api-key utils", () => {
  it("produces a raw with a stable jtk_ prefix", () => {
    const { raw, prefix } = generateApiKey();
    expect(raw).toMatch(/^jtk_[a-f0-9]{40}$/);
    expect(prefix).toBe(raw.slice(0, 8));
  });
  it("hashing the same raw is idempotent and does not equal the raw", () => {
    const { raw, hash } = generateApiKey();
    expect(hashApiKey(raw)).toBe(hash);
    expect(hash).not.toBe(raw);
    expect(hash).toMatch(/^[a-f0-9]{64}$/); // sha256 hex
  });
});
```

- [ ] **Step 2: Run test, confirm FAIL**

Run: `npx vitest run src/tests/apikey.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `apps/server/src/utils/api-key.ts`**

```typescript
import { createHash, randomBytes } from "crypto";

export function generateApiKey(): {
  raw: string;
  hash: string;
  prefix: string;
} {
  const raw = "jtk_" + randomBytes(20).toString("hex"); // 40 hex chars after prefix
  const hash = hashApiKey(raw);
  const prefix = raw.slice(0, 8); // "jtk_xxxx" — enough to disambiguate in a list
  return { raw, hash, prefix };
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
```

- [ ] **Step 4: Run test to confirm PASS.**

- [ ] **Step 5: Create the model at `apps/server/src/models/ApiKey.model.ts`**

```typescript
import mongoose, { Schema, Document, Types } from "mongoose";

export interface IApiKeyDocument extends Document {
  userId: Types.ObjectId;
  name: string;
  keyHash: string;
  prefix: string;
  lastUsedAt?: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const apiKeySchema = new Schema<IApiKeyDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    keyHash: { type: String, required: true, unique: true },
    prefix: { type: String, required: true },
    lastUsedAt: Date,
    revokedAt: Date,
  },
  { timestamps: true },
);

export const ApiKey = mongoose.model<IApiKeyDocument>("ApiKey", apiKeySchema);
```

- [ ] **Step 6: Typecheck + commit**

```
npm run typecheck
git add apps/server/src/models/ApiKey.model.ts apps/server/src/utils/api-key.ts apps/server/src/tests/apikey.test.ts
git commit -m "feat(server): ApiKey model and hash/generate utilities"
```

---

## Task 2: API-key auth middleware

**Files:**

- Create: `apps/server/src/middleware/api-key-auth.ts`
- Modify: `apps/server/src/middleware/auth.middleware.ts` (extract the `req.user` shape into a shared type or reuse `declare global`)
- Test: extend `apps/server/src/tests/apikey.test.ts`

**Interfaces:**

- Consumes: `ApiKey` model, `hashApiKey` from Task 1
- Produces: `authenticateByApiKey(req, res, next)` — looks up by `keyHash` where `revokedAt` is null, sets `req.user = { userId, email }`, updates `lastUsedAt`

- [ ] **Step 1: Write the failing test**

```typescript
// Append to apikey.test.ts
import request from "supertest";
import express from "express";
import mongoose from "mongoose";
import { ApiKey } from "../models/ApiKey.model.js";
import { authenticateByApiKey } from "../middleware/api-key-auth.js";
import { connectTestDb, disconnectTestDb } from "./helpers/test-db.js";

describe("authenticateByApiKey", () => {
  beforeAll(connectTestDb);
  afterAll(disconnectTestDb);
  beforeEach(async () => {
    await ApiKey.deleteMany({});
  });

  function makeApp() {
    const app = express();
    app.get("/ping", authenticateByApiKey, (req, res) => {
      res.json({ ok: true, userId: req.user?.userId });
    });
    return app;
  }

  it("rejects missing header with 401", async () => {
    const r = await request(makeApp()).get("/ping");
    expect(r.status).toBe(401);
  });

  it("accepts a valid raw key and returns the userId", async () => {
    const { raw, hash, prefix } = generateApiKey();
    const userId = new mongoose.Types.ObjectId();
    await ApiKey.create({ userId, name: "test", keyHash: hash, prefix });
    const r = await request(makeApp()).get("/ping").set("x-api-key", raw);
    expect(r.status).toBe(200);
    expect(r.body.userId).toBe(String(userId));
  });

  it("rejects a revoked key", async () => {
    const { raw, hash, prefix } = generateApiKey();
    await ApiKey.create({
      userId: new mongoose.Types.ObjectId(),
      name: "test",
      keyHash: hash,
      prefix,
      revokedAt: new Date(),
    });
    const r = await request(makeApp()).get("/ping").set("x-api-key", raw);
    expect(r.status).toBe(401);
  });

  it("bumps lastUsedAt on success", async () => {
    const { raw, hash, prefix } = generateApiKey();
    const doc = await ApiKey.create({
      userId: new mongoose.Types.ObjectId(),
      name: "test",
      keyHash: hash,
      prefix,
    });
    await request(makeApp()).get("/ping").set("x-api-key", raw);
    await doc.reload?.();
    const found = await ApiKey.findById(doc._id).lean();
    expect(found?.lastUsedAt).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: Run test to confirm FAIL.**

- [ ] **Step 3: Implement `apps/server/src/middleware/api-key-auth.ts`**

```typescript
import { Request, Response, NextFunction } from "express";
import { ApiKey } from "../models/ApiKey.model.js";
import { User } from "../models/User.model.js";
import { hashApiKey } from "../utils/api-key.js";

export async function authenticateByApiKey(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const raw = req.header("x-api-key");
  if (!raw) {
    res
      .status(401)
      .json({ success: false, error: { code: "AUTH_MISSING_API_KEY" } });
    return;
  }
  const hash = hashApiKey(raw);
  const key = await ApiKey.findOne({ keyHash: hash, revokedAt: null });
  if (!key) {
    res
      .status(401)
      .json({ success: false, error: { code: "AUTH_INVALID_API_KEY" } });
    return;
  }
  const user = await User.findById(key.userId).lean();
  if (!user) {
    res
      .status(401)
      .json({ success: false, error: { code: "AUTH_USER_NOT_FOUND" } });
    return;
  }
  req.user = { userId: String(user._id), email: user.email };
  // Fire-and-forget: never let an audit write break an auth flow.
  ApiKey.updateOne(
    { _id: key._id },
    { $set: { lastUsedAt: new Date() } },
  ).catch(() => {});
  next();
}
```

- [ ] **Step 4: Run tests to confirm PASS.**

- [ ] **Step 5: Commit**

```
git commit -am "feat(server): authenticateByApiKey middleware for extension traffic"
```

---

## Task 3: API-key issue / list / revoke endpoints (JWT-protected)

**Files:**

- Create: `apps/server/src/controllers/apikey.controller.ts`
- Create: `apps/server/src/routes/apikey.routes.ts`
- Modify: `apps/server/src/app.ts` (mount at `/api/v1/apikeys`)
- Test: `apps/server/src/tests/apikey.test.ts` (append)

**Interfaces:**

- Produces: `POST /api/v1/apikeys` returns `{ key, id, prefix, name, createdAt }` — raw key shown once
- Produces: `GET /api/v1/apikeys` returns list of `{ id, name, prefix, lastUsedAt, revokedAt, createdAt }`
- Produces: `DELETE /api/v1/apikeys/:id` sets `revokedAt`

- [ ] **Step 1: Write the failing test**

Cover: 401 without JWT; issue returns a `jtk_` key; the raw never appears in the list response; revoke makes subsequent `authenticateByApiKey` calls 401. Use existing JWT test helpers if present in `auth.test.ts`.

- [ ] **Step 2: Implement controller + routes, mount under `/api/v1/apikeys`**

- [ ] **Step 3: Run tests, commit**

```
git commit -am "feat(server): API-key issue/list/revoke endpoints (JWT-protected)"
```

---

## Task 4: `findOrCreateJob` service

**Files:**

- Create: `apps/server/src/services/job-upsert.service.ts`
- Test: `apps/server/src/tests/job-upsert.test.ts`

**Interfaces:**

- Consumes: `Job` model, existing `parseJD` service (do NOT auto-invoke — the user can trigger parse from the UI)
- Produces: `findOrCreateJob(userId, draft: ApplicationDraft): Promise<{ job: IJobDocument; created: boolean }>`

Rationale: the extension has a URL, a company name, and a job title (from the DOM). It does not know whether the user already added this job manually. Match strategy:

1. **Primary:** exact `applyUrl` or `sourceUrl` match for the same `userId` → reuse
2. **Secondary:** normalized `(companyName + jobTitle)` match within last 60 days → reuse (with a warning log so the user can inspect)
3. **Fallback:** create a new Job with `source: 'extension'`, `jdRawText` from the extractor, no `parsedJD`

- [ ] **Step 1: Write the failing tests**

Cover: URL match hit, URL miss + title+company hit within 60d, both miss → create, subsequent identical calls return the same jobId (idempotency).

- [ ] **Step 2: Implement `job-upsert.service.ts`**

```typescript
import { Job, IJobDocument } from "../models/Job.model.js";
import type { ApplicationDraft } from "./application-draft.types.js";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export async function findOrCreateJob(
  userId: string,
  draft: ApplicationDraft,
): Promise<{ job: IJobDocument; created: boolean }> {
  const byUrl = await Job.findOne({
    userId,
    $or: [{ applyUrl: draft.sourceUrl }, { sourceUrl: draft.sourceUrl }],
  });
  if (byUrl) return { job: byUrl, created: false };

  // Secondary match: same company + title within 60 days
  const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const byTitle = await Job.findOne({
    userId,
    companyName: {
      $regex: new RegExp(`^${escapeRegex(draft.companyName)}$`, "i"),
    },
    jobTitle: { $regex: new RegExp(`^${escapeRegex(draft.jobTitle)}$`, "i") },
    createdAt: { $gte: cutoff },
  });
  if (byTitle) return { job: byTitle, created: false };

  const created = await Job.create({
    userId,
    companyName: draft.companyName,
    jobTitle: draft.jobTitle,
    jdRawText: draft.jdRawText,
    applyUrl: draft.sourceUrl,
    sourceUrl: draft.sourceUrl,
    source: "extension",
  });
  return { job: created, created: true };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

Also add `normalize` usage if the tests need whitespace-insensitive match — but the primary is exact URL and exact (case-insensitive) company+title, so `escapeRegex` on the full string suffices.

Add `ApplicationDraft` shared type at `apps/server/src/services/application-draft.types.ts`:

```typescript
export interface ApplicationDraft {
  platform: "greenhouse" | "lever" | "ashby" | "workday" | "unknown";
  sourceUrl: string;
  companyName: string;
  jobTitle: string;
  jdRawText: string;
  detectedAt: string; // ISO
}
```

- [ ] **Step 3: Run tests, commit**

---

## Task 5: `POST /applications/from-extension`

**Files:**

- Modify: `apps/server/src/controllers/application.controller.ts` (add `createFromExtension`)
- Modify: `apps/server/src/routes/application.routes.ts` (register route BEFORE the JWT `router.use(authenticate)`, or split into two routers)
- Modify: `apps/server/src/app.ts` if the router split requires it
- Test: `apps/server/src/tests/application-from-extension.test.ts`

**Interfaces:**

- Consumes: `findOrCreateJob`, `Application` model
- Produces: `POST /api/v1/applications/from-extension` (x-api-key) → `{ success, data: { jobId, applicationId, jobCreated, applicationCreated } }`

Rationale for the router split: existing `application.routes.ts` does `router.use(authenticate)` at the top. We need one route (`/from-extension`) under `authenticateByApiKey` instead. Cleanest: register the extension route directly on `app.ts` with its own middleware chain, OR use `express.Router()` at two mount points. Pick the second: rename existing file's router to `applicationJwtRouter` and add a new `applicationExtensionRouter` mounted at the same path but with a different guard.

Actually simpler: add `router.post('/from-extension', authenticateByApiKey, handler)` BEFORE `router.use(authenticate)` at line 18 — but that's fragile. Best fix: register the `/from-extension` path in `app.ts` directly, bypassing the `application.routes.ts` JWT gate.

Chosen: register in app.ts as `app.post('/api/v1/applications/from-extension', authenticateByApiKey, createFromExtension)`. One line, no router gymnastics.

- [ ] **Step 1: Write the failing tests** — cover: 401 without key, 201 with key + fresh job, 200 (or 201 with `applicationCreated: false`) on re-poll of same URL, `previousStatus` seeded, timeline event added on creation.

- [ ] **Step 2: Implement handler**

```typescript
export async function createFromExtension(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = extensionDraftSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({
        success: false,
        error: { code: "INVALID_DRAFT", details: parsed.error.issues },
      });
    return;
  }
  const userId = req.user!.userId;
  const draft = parsed.data;
  const { job, created: jobCreated } = await findOrCreateJob(userId, draft);
  const existingApp = await Application.findOne({ userId, jobId: job._id });
  if (existingApp) {
    res.json({
      success: true,
      data: {
        jobId: job._id,
        applicationId: existingApp._id,
        jobCreated: false,
        applicationCreated: false,
      },
    });
    return;
  }
  const app = await Application.create({
    userId,
    jobId: job._id,
    status: "applied",
    previousStatus: [],
    timelineEvents: [
      {
        event: "Application recorded via browser extension",
        description: `Detected on ${draft.platform} at ${draft.sourceUrl}`,
        eventDate: new Date(draft.detectedAt),
        type: "status_change",
      },
    ],
  });
  res
    .status(201)
    .json({
      success: true,
      data: {
        jobId: job._id,
        applicationId: app._id,
        jobCreated,
        applicationCreated: true,
      },
    });
}
```

`extensionDraftSchema` is a Zod object with the same shape as `ApplicationDraft`.

- [ ] **Step 3: Mount in app.ts + run tests, commit**

---

## Task 6: Extension workspace package scaffold

**Files:**

- Create: `apps/extension/package.json`
- Create: `apps/extension/tsconfig.json`
- Create: `apps/extension/esbuild.config.mjs`
- Create: `apps/extension/manifest.json`
- Modify: root `package.json` (workspaces array already includes `apps/*` — verify)
- Modify: `apps/extension/.gitignore`

**Interfaces:**

- Produces: buildable extension dist; `npm run build --workspace=@jobtailor/extension` produces `dist/` loadable via chrome://extensions → Load unpacked

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "@jobtailor/extension",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node esbuild.config.mjs",
    "dev": "node esbuild.config.mjs --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint src/"
  },
  "devDependencies": {
    "chrome-types": "^0.1.300",
    "esbuild": "^0.24.0",
    "vitest": "^3.2.6",
    "@testing-library/dom": "^10.4.0",
    "happy-dom": "^15.0.0",
    "typescript": "^5.8.2"
  }
}
```

- [ ] **Step 2: Write `manifest.json`** — MV3, permissions `["storage", "activeTab", "scripting"]`, `host_permissions` for `https://boards.greenhouse.io/*`, `https://jobs.lever.co/*`, `https://jobs.ashbyhq.com/*`, `https://*.myworkdayjobs.com/*`. `background.service_worker = "background.js"`. `action.default_popup = "popup.html"`. `options_page = "options.html"`. `content_scripts` with one entry per platform matching `js/content.js`.

- [ ] **Step 3: Write `esbuild.config.mjs`** — four entry points (background, content, popup, options), bundle to `dist/`, target `chrome120`.

- [ ] **Step 4: Write minimal stubs** at `src/background/index.ts`, `src/content/index.ts`, `src/popup/popup.ts`, `src/options/options.ts` — each just logs "loaded" so the build succeeds.

- [ ] **Step 5: Add `.gitignore` for `dist/` and `node_modules/`; wire into the root `turbo.json` pipeline if it lists tasks by name**

- [ ] **Step 6: Run `npm install` + `npm run build -w @jobtailor/extension`** — expect dist/ populated. Typecheck should pass.

- [ ] **Step 7: Commit**

```
git add apps/extension package-lock.json
git commit -m "feat(extension): scaffold MV3 workspace package with esbuild + stubs"
```

---

## Task 7: Platform registry + shared types

**Files:**

- Create: `apps/extension/src/types.ts`
- Create: `apps/extension/src/platform-registry.ts`
- Test: `apps/extension/tests/platform-registry.test.ts`

**Interfaces:**

- Produces: `ApplicationDraft`, `Detector`, `Extractor`, `PlatformConfig`, `detectPlatform(url: string): PlatformConfig | null`

- [ ] **Step 1: Define types** in `types.ts`.

- [ ] **Step 2: Write failing test**

```typescript
import { describe, it, expect } from "vitest";
import { detectPlatform } from "../src/platform-registry.js";

describe("platform-registry", () => {
  it("recognizes greenhouse job URLs", () => {
    expect(
      detectPlatform("https://boards.greenhouse.io/acme/jobs/12345")?.id,
    ).toBe("greenhouse");
  });
  it("recognizes lever job URLs", () => {
    expect(detectPlatform("https://jobs.lever.co/acme/abc-123")?.id).toBe(
      "lever",
    );
  });
  it("recognizes ashby job URLs", () => {
    expect(detectPlatform("https://jobs.ashbyhq.com/acme/uuid-here")?.id).toBe(
      "ashby",
    );
  });
  it("recognizes workday URLs", () => {
    expect(
      detectPlatform(
        "https://acme.wd1.myworkdayjobs.com/en-US/External/job/xyz",
      )?.id,
    ).toBe("workday");
  });
  it("returns null for unknown URL", () => {
    expect(detectPlatform("https://example.com/jobs/1")).toBeNull();
  });
});
```

- [ ] **Step 3: Implement registry** with four entries (stub `detector` + `extractor` for now; Tasks 8-13 replace them).

- [ ] **Step 4: Run tests (5 pass), commit**

---

## Task 8: Greenhouse detector

**Files:**

- Modify: `apps/extension/src/detectors/greenhouse.ts`
- Test: `apps/extension/tests/detectors.test.ts` (append)

**Interfaces:**

- Produces: `greenhouseDetector: Detector` — given a document/URL, returns `true` when the user has submitted the application

Detection strategy for Greenhouse (public boards):

1. URL changes to `.../thank-you` or `.../application/thank-you` (the site's confirmation path)
2. OR DOM selector: element with text "Thanks for applying" / "Application complete" visible

The detector is called repeatedly by a MutationObserver on the content script. It should be a pure function of the current document state.

- [ ] **Step 1: Write failing tests using @testing-library happy-dom fixtures** — one for URL, one for the thank-you div, one for a negative case (regular application form).

- [ ] **Step 2: Implement detector:**

```typescript
export const greenhouseDetector: Detector = {
  id: "greenhouse",
  isApplicationSubmitted(ctx: DetContext): boolean {
    if (/\/thank-?you\/?$/i.test(ctx.url)) return true;
    const body = ctx.document.body?.innerText ?? "";
    return /thanks for applying|application (?:submitted|received|complete)/i.test(
      body,
    );
  },
};
```

- [ ] **Step 3: Run tests, commit**

---

## Task 9: Greenhouse extractor

**Files:**

- Modify: `apps/extension/src/extractors/greenhouse.ts`
- Test: `apps/extension/tests/extractors.test.ts`

**Interfaces:**

- Produces: `greenhouseExtractor: Extractor` — returns `ApplicationDraft` from a job page's DOM

Greenhouse job pages have a predictable structure:

- `document.title` = "Senior Engineer @ Acme — Greenhouse" (or the org's custom title)
- `<meta property="og:title">` — most reliable
- `h1` on the job listing sidebar contains the role; the company comes from the `boards.greenhouse.io/<slug>` path segment
- Job body: `#app ` main content div, `innerText` is the full JD

- [ ] **Step 1: Write failing tests with a fixture HTML** — extract companyName, jobTitle, jdRawText, sourceUrl.

- [ ] **Step 2: Implement:**

```typescript
export const greenhouseExtractor: Extractor = {
  id: "greenhouse",
  extract(ctx: ExtractContext): ApplicationDraft {
    const url = new URL(ctx.url);
    const companySlug = url.pathname.split("/")[1] ?? "unknown";
    const title =
      ctx.document
        .querySelector('meta[property="og:title"]')
        ?.getAttribute("content") ??
      ctx.document.title.split("·")[0].trim() ??
      "Untitled role";
    const body = ctx.document.querySelector("#app")?.innerText ?? "";
    return {
      platform: "greenhouse",
      sourceUrl: ctx.url,
      companyName: title.includes("@")
        ? title.split("@")[1].trim()
        : companySlug,
      jobTitle: title.includes("@") ? title.split("@")[0].trim() : title,
      jdRawText: body.slice(0, 20000),
      detectedAt: new Date().toISOString(),
    };
  },
};
```

- [ ] **Step 3: Run tests, commit**

---

## Tasks 10-13: Lever + Ashby + Workday detectors and extractors

Same pattern as Tasks 8-9. Each pair (detector + extractor) is one task. Four tasks total, each with a fixture HTML + a couple of assertions.

For brevity in this plan the specific selectors are omitted — the executor reads the platform's public docs. Note: the URLs above are stable, so the executors write these tests against the _shape_ of the returned ApplicationDraft (fields present, non-empty), not against brittle DOM selectors.

- [ ] **Task 10: Lever detector + extractor**
- [ ] **Task 11: Ashby detector + extractor**
- [ ] **Task 12: Workday detector + extractor** — Workday is the messiest (each org customizes the URL and pages have SPA navigation); detector primarily relies on `document.title` containing "Application complete" and URL matching `/application/` post-submit
- [ ] **Task 13: Registry update** — wire the four detector/extractor pairs into `platform-registry.ts` (replacing the stubs from Task 7); re-run `platform-registry.test.ts`

Each ends with the standard 4-step cycle: write failing tests → implement → tests pass → commit.

---

## Task 14: Content script that wires detector + extractor to background

**Files:**

- Modify: `apps/extension/src/content/index.ts`
- Test: not directly testable in jsdom (chrome.runtime API); covered by the e2e in Task 16

**Interfaces:**

- Consumes: `detectPlatform`, `Detector.isApplicationSubmitted`, `Extractor.extract`
- Produces: on submit-detected, `chrome.runtime.sendMessage({ type: 'DETECTED', draft: ApplicationDraft })`

- [ ] **Step 1: Implement**

```typescript
import { detectPlatform } from "../platform-registry.js";
import type { ApplicationDraft } from "../types.js";

const platform = detectPlatform(location.href);
let alreadySent = false;

function tryDetect(): void {
  if (!platform || alreadySent) return;
  if (
    !platform.detector.isApplicationSubmitted({ url: location.href, document })
  )
    return;
  const draft = platform.extractor.extract({ url: location.href, document });
  chrome.runtime.sendMessage({ type: "DETECTED", draft });
  alreadySent = true;
}

// MutationObserver + popstate catch SPA navigations like Workday
const observer = new MutationObserver(() => tryDetect());
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("popstate", tryDetect);
window.addEventListener("hashchange", tryDetect);
```

- [ ] **Step 2: Typecheck + commit**

---

## Task 15: Background service worker + popup

**Files:**

- Modify: `apps/extension/src/background/index.ts`
- Modify: `apps/extension/src/popup/popup.ts`
- Modify: `apps/extension/src/popup/popup.html`

**Interfaces:**

- Consumes: `DETECTED` message from content script
- Produces: `chrome.action.setBadgeText({ text: "1" })` on detect, popup renders the draft, POSTs to `/api/v1/applications/from-extension` on confirm

- [ ] **Step 1: Background**

```typescript
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "DETECTED") {
    chrome.storage.local.set({ pendingDraft: msg.draft });
    chrome.action.setBadgeText({ text: "1" });
  }
  if (msg.type === "USER_CONFIRMED_ADD") {
    postToServer(msg.draft).then(sendResponse);
    return true; // async sendResponse
  }
});

async function postToServer(draft: ApplicationDraft) {
  const { apiKey, apiBase } = await chrome.storage.sync.get([
    "apiKey",
    "apiBase",
  ]);
  if (!apiKey) return { ok: false, error: "API key not configured" };
  const res = await fetch(`${apiBase}/applications/from-extension`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify(draft),
  });
  const body = await res.json();
  chrome.action.setBadgeText({ text: "" });
  return { ok: res.ok, body };
}
```

- [ ] **Step 2: Popup** reads `pendingDraft` from `chrome.storage.local`, renders a small card with company + title + source URL + "Add to JobTailor" / "Skip" buttons. Skip clears the badge + draft. Add posts message `USER_CONFIRMED_ADD`.

- [ ] **Step 3: Build + manually load unpacked (`chrome://extensions`), verify badge appears.**

- [ ] **Step 4: Commit**

---

## Task 16: Options page — API key + platform toggles

**Files:**

- Modify: `apps/extension/src/options/options.ts` + `options.html`

- [ ] **Step 1: Implement** — a form with:
  - `apiBase` (default `http://localhost:5000/api/v1`)
  - `apiKey` — text input with a "Test connection" button that hits `/api/v1/apikeys` (list endpoint) as a lightweight probe
  - Four checkboxes for platforms (all on by default), stored in `chrome.storage.sync.enabledPlatforms`
  - Optional "Always add from these sites" toggle (default OFF) — if ON, the background skips the popup and posts immediately

- [ ] **Step 2: Build, load, verify save persists.**

- [ ] **Step 3: Commit**

---

## Task 17: E2E test — server side round-trip

**Files:**

- Test: `apps/server/src/tests/extension-flow.e2e.test.ts`

- [ ] **Step 1: Write the test**

Simulate the full extension journey server-side:

1. Register user → login → get JWT
2. `POST /api/v1/apikeys` → get raw key
3. `POST /api/v1/applications/from-extension` with an ApplicationDraft → 201, `jobCreated: true`, `applicationCreated: true`
4. Same POST again → 200/201 with both `false` (idempotent)
5. `GET /api/v1/applications/:id` (JWT) → verify status `'applied'` and the timeline event from the extension exists
6. Revoke the key, retry POST → 401

- [ ] **Step 2: Run, fix anything the individual unit tests missed.**

- [ ] **Step 3: Update MVP_STATUS.md** with a "Tier 1 Feature 2 shipped" section (mirroring how Feature 1 is documented).

- [ ] **Step 4: Update TODO_PLAN.md** — check off Feature 2 items.

- [ ] **Step 5: Commit**

---

## Self-Review

**Spec coverage** — TODO_PLAN Feature 2 sub-tasks:

- Extension scaffold → Tasks 6, 7 ✅
- Platform detectors (LinkedIn, Greenhouse, Lever, Workday, Ashby, SmartRecruiters) → Tasks 8-13 cover **four** of the six named platforms (Greenhouse, Lever, Ashby, Workday). LinkedIn and SmartRecruiters are explicitly out of scope for v1: LinkedIn because the apply flow is a modal with token-bound submission and its ToS is aggressive about automation; SmartRecruiters because its public job board layout varies by tenant. **Flagged: v1 ships 4/6 platforms. Adding the other two is a follow-up plan, not a gap in this one.**
- Application submission detection → detector files per platform (Tasks 8, 10, 11, 12) ✅
- Job data extraction → extractor files per platform ✅
- Popup UI → Task 15 ✅
- API bridge → Tasks 1-5 (server) + Task 15 (extension call) ✅
- Match detection (reuse existing job) → Task 4's URL + company+title fallback ✅
- Auto-parse JD after application → intentionally **not** in v1: keeps API cost tied to view-time, matches Plan 1's philosophy. Flagged below.
- Settings page → Task 16 ✅

**Deferred on purpose:**

1. **Auto-parse JD after extension-created job.** Would silently run OpenAI/Gemini per submission. Given the user can already trigger parse from the Jobs page, deferring is honest.
2. **LinkedIn + SmartRecruiters detectors.** Non-trivial; separate plan when needed.
3. **"Always add" auto-submit toggle.** Task 16 wires the flag; the background respects it. Risk: if a false-positive detector fires, we auto-create garbage Applications. Recommended to leave the toggle off by default and let the user consciously enable it after using v1 manually for a while.

**Placeholders to expand at execution time:**

- Task 4's `findOrCreateJob` secondary match: the test cases in Step 1 are named but not fully written. Executor writes them against the shape of the existing Job model.
- Tasks 10-13: each platform's exact selector set. The plan gives the detection _strategy_; the executor reads the platform's live DOM (or an archived HTML fixture) to pick the selectors. **Before executing these, save 2-3 HTML fixtures per platform in `apps/extension/tests/fixtures/` so tests are hermetic.**
- Task 17's E2E is sketched but the assertions on `previousStatus` seeding and timeline event shape need to match the real model. Executor reads `Application.model.ts` at that step.

**Type consistency:** `ApplicationDraft` shape is defined once in Task 4 (`apps/server/src/services/application-draft.types.ts`) and duplicated for the extension in Task 7 (`apps/extension/src/types.ts`). If these drift, the Zod schema on the server catches it. A future improvement is a shared-types package entry, but for v1 duplication + a Zod guard is honest.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-26-chrome-extension-auto-track.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks. Chrome extension work is exactly the kind of multi-subsystem task that benefits from isolated reviews.
2. **Inline execution** — batch tasks in this session with checkpoints.

**Which approach?** Also: the 11 unpushed Plan 1 commits are still local. Push those first (triggers the L3 security gate), or keep building locally and push when Plan 2 lands?
