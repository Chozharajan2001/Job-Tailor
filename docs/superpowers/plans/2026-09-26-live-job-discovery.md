# Live Job Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the `CanonicalJob` collection with real, deduplicated, source-tracked job listings from public career-page APIs (Greenhouse, Lever, Ashby) and an RSS feed (RemoteOK), so a new user's first search, feed, and alerts return live results on day one.

**Architecture:** A `SourceConnector` abstraction normalizes each platform's public JSON API into the shape the existing `IngestionService` already consumes. A `SourceRegistry` entry per company per platform stores the connector type, polling interval, and error state. A `source-poller` service runs on an external cron (GitHub Action) and hits `POST /api/v1/admin/poll-due-sources` with an admin key. Cheap fields (title, company, location, description HTML) go into `CanonicalJob` immediately; LLM parsing stays on-demand to keep cost tied to usage, not crawl volume.

**Tech Stack:** Node 22, TypeScript 5.8, Express 5, Mongoose 8, Zod 3, Vitest 3 (mocking with `nock` for HTTP), `undici` for outbound fetch, GitHub Actions for cron. No new runtime dependencies beyond `nock` in dev.

**Spec:** This plan implements Tier 1 · Feature 1 from `TODO_PLAN.md`. Related design references: `docs/system-design.md` (search subsystem), `docs/advanced-job-search-engine.md` (Sprints 1–4 architecture).

## Global Constraints

- Node.js >= 18 (recommend 22+), npm >= 9, TypeScript strict mode
- All outbound HTTP requests must set a descriptive `User-Agent` string: `JobTailor-Bot/1.0 (+<contact-email>)`
- All API calls must respect per-source rate limits; batch with concurrency cap of 5
- All AI calls go through `AIProviderManager` (never call a vendor SDK directly) — not applicable to this feature (no AI at poll time), but the rule still binds
- Zod validation on every request body / query / param
- Every route returns the standard envelope `{ success: boolean, data?: any, error?: { code, message } }`
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`) and must pass commitlint's `body-max-line-length: 100`
- Test discovery path is `apps/server/src/tests/**/*.test.ts`, run via `npm run test --workspace=job-tailor-server`
- Typecheck is `npm run typecheck` (must be clean at every commit — pre-commit hook enforces)
- No real credentials in code or fixtures; admin key comes from `SOURCE_POLL_ADMIN_KEY` env var

## File Structure

```
apps/server/src/
├── models/
│   └── SourceRegistry.model.ts                [MODIFY] add connectorType, companyId, lastPolledAt, errorCount, lastError
├── services/
│   ├── source-connectors/                     [NEW dir]
│   │   ├── types.ts                           RawJob, CanonicalJobInput, SourceConnector interface
│   │   ├── greenhouse.ts                      Greenhouse boards-api connector
│   │   ├── lever.ts                           Lever postings-api connector
│   │   ├── ashby.ts                           Ashby posting-api connector
│   │   ├── remoteok.ts                        RemoteOK RSS connector
│   │   └── index.ts                           getConnector(type): SourceConnector registry map
│   ├── source-poller.service.ts               [NEW] pollSource(id) + pollDueSources()
│   ├── source-seed.service.ts                 [NEW] bulk-register SourceRegistry entries from a JSON list
│   └── ingestion.service.ts                   [MODIFY] add IngestionService.ingestFromConnector(source, input)
├── controllers/
│   └── admin.controller.ts                    [NEW] pollDueSources, seedSources
├── routes/
│   └── admin.routes.ts                        [NEW] mount under /api/v1/admin/*, behind requireAdminKey
├── middleware/
│   └── admin-auth.ts                          [NEW] requireAdminKey checks x-admin-key header vs env
└── tests/
    ├── source-connectors.test.ts              [NEW] per-connector parse tests with nock fixtures
    ├── source-poller.test.ts                  [NEW] poll + trust-decay + circuit-breaker tests
    └── source-seed.test.ts                    [NEW] bulk registration + idempotency tests

data/
└── seed-companies.json                        [NEW] curated starter list of Greenhouse/Lever/Ashby tokens

.github/workflows/
└── poll-sources.yml                           [NEW] cron every 6h hitting POST /api/v1/admin/poll-due-sources
```

Files that change together live together: each connector is one file per platform. Adding a new platform (SmartRecruiters, Workable) is one new file plus one line in `index.ts` plus one enum entry.

## Interfaces

**Consumes** (existing code):

- `IngestionService.ingestJob(input: IJobIngestionInput)` at `apps/server/src/services/ingestion.service.ts:51` — the existing pipeline that runs L1/L2/L3 dedup and dispatches alerts; Task 7 extends `IJobIngestionInput` to accept a `sourceId` + `'api_connector'` sourceType so this method can be reused as-is
- `CleanupService.decaySourceTrust(sourceId, amount)` / `boostSourceTrust(sourceId, amount)` at `apps/server/src/services/cleanup.service.ts:10,33` — already used by link-health verification; the poller reuses them for consistency
- Test helpers `connectTestDb` / `disconnectTestDb` at `apps/server/src/tests/helpers/test-db.js` — every new test file uses them
- `SourceRegistry` model at `apps/server/src/models/SourceRegistry.model.ts`
- `CanonicalJob` model at `apps/server/src/models/CanonicalJob.model.ts` — note: field for parsed JD is `structuredJD`, **not** `parsedJD`

**Produces** (for downstream features in Tier 1 / Tier 2):

- `getConnector(type: SourceConnectorType): SourceConnector` — used by `source-poller.service.ts`
- `pollSource(sourceId: string): Promise<PollResult>` — exposed via `POST /api/v1/admin/sources/:id/poll`
- `pollDueSources(): Promise<PollSummary>` — exposed via `POST /api/v1/admin/poll-due-sources`
- `seedSources(list: SeedItem[]): Promise<SeedSummary>` — exposed via `POST /api/v1/admin/seed-sources`
- `SourceRegistry.lastPolledAt: Date | null` — read by the poller to decide which are due
- `CanonicalJob.sourceId: ObjectId` — links each job to the SourceRegistry row that produced it (already exists; this plan just starts populating it)

---

## Task 1: Extend SourceRegistry model

**Files:**

- Modify: `apps/server/src/models/SourceRegistry.model.ts`
- Test: `apps/server/src/tests/source-seed.test.ts` (created in Task 10; Task 1 test is a model-shape assertion inline)

**Interfaces:**

- Produces: `ISourceRegistryDocument` with `connectorType`, `companyId`, `lastPolledAt`, `errorCount`, `lastError`

- [ ] **Step 1: Add TypeScript interface fields**

Edit `apps/server/src/models/SourceRegistry.model.ts`. Extend the interface after `isEnabled`:

```typescript
export type SourceConnectorType = "greenhouse" | "lever" | "ashby" | "remoteok";

export interface ISourceRegistryDocument extends Document {
  name: string;
  sourceType: SearchSourceType;
  connectorType?: SourceConnectorType;
  companyId?: string; // e.g. "stripe" for greenhouse boards-api/stripe
  baseUrl: string;
  crawlFrequency: number;
  extractionStrategy: SearchExtractionStrategy;
  robotsPolicy?: { allowCrawl: boolean; crawlDelay?: number };
  trustScore: number;
  isEnabled: boolean;
  lastPolledAt?: Date;
  errorCount: number; // consecutive failures since last success
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 2: Extend Mongoose schema**

Below the `isEnabled` schema block, add:

```typescript
connectorType: {
  type: String,
  enum: ['greenhouse', 'lever', 'ashby', 'remoteok'],
  required: false,
},
companyId: {
  type: String,
  trim: true,
  required: false,
},
lastPolledAt: { type: Date, required: false },
errorCount: { type: Number, default: 0, min: 0 },
lastError: { type: String, required: false },
```

Add an index right after the existing schema for the poll query:

```typescript
sourceRegistrySchema.index({ isEnabled: 1, lastPolledAt: 1 });
```

- [ ] **Step 3: Widen sourceType enum to include api_connector**

The existing enum is `['manual_paste', 'public_job_page']`. Add a third value so connector-based rows can coexist with URL-scraped rows:

```typescript
enum: ['manual_paste', 'public_job_page', 'api_connector'],
```

- [ ] **Step 4: Add the same union value in shared-types**

Edit `packages/shared-types/src/index.ts` and add `'api_connector'` to the `SearchSourceType` union export so client + admin UI know about it.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: 3/3 packages pass.

- [ ] **Step 6: Commit**

```
git add apps/server/src/models/SourceRegistry.model.ts packages/shared-types/src/index.ts
git commit -m "feat(server): extend SourceRegistry with connector fields for live job discovery"
```

---

## Task 2: SourceConnector types and registry

**Files:**

- Create: `apps/server/src/services/source-connectors/types.ts`
- Create: `apps/server/src/services/source-connectors/index.ts`

**Interfaces:**

- Produces: `RawJob`, `CanonicalJobInput`, `SourceConnector` interface, `getConnector(type): SourceConnector`

- [ ] **Step 1: Write the shared types**

Create `apps/server/src/services/source-connectors/types.ts`:

```typescript
import type { SourceConnectorType } from "../../models/SourceRegistry.model.js";

export interface RawJob {
  externalId: string; // platform-native job id
  url: string; // absolute URL to the job
  title: string;
  companyName: string;
  locationText?: string;
  descriptionHtml?: string;
  publishedAt?: Date;
  updatedAt?: Date;
  department?: string;
  team?: string;
  employmentType?: string;
  salaryText?: string;
}

export interface CanonicalJobInput {
  title: string;
  companyName: string;
  location?: string;
  jdRawText: string;
  sourceUrl: string;
  externalId: string;
  publishedAt?: Date;
  updatedAt?: Date;
  employmentType?: string;
}

export interface SourceConnector {
  type: SourceConnectorType;
  /** Fetch all currently-listed jobs for one company token. */
  fetchJobs(token: string): Promise<RawJob[]>;
  /** Normalize a platform-specific job into our common shape. */
  toCanonicalJob(raw: RawJob, companyHint?: string): CanonicalJobInput;
}
```

- [ ] **Step 2: Write the registry stub**

Create `apps/server/src/services/source-connectors/index.ts`:

```typescript
import type { SourceConnectorType } from "../../models/SourceRegistry.model.js";
import type { SourceConnector } from "./types.js";
import { greenhouseConnector } from "./greenhouse.js";
import { leverConnector } from "./lever.js";
import { ashbyConnector } from "./ashby.js";
import { remoteokConnector } from "./remoteok.js";

const REGISTRY: Record<SourceConnectorType, SourceConnector> = {
  greenhouse: greenhouseConnector,
  lever: leverConnector,
  ashby: ashbyConnector,
  remoteok: remoteokConnector,
};

export function getConnector(type: SourceConnectorType): SourceConnector {
  const c = REGISTRY[type];
  if (!c) throw new Error(`No connector registered for type: ${type}`);
  return c;
}
```

- [ ] **Step 3: Temporarily stub the four connector files so this task typechecks**

Create `apps/server/src/services/source-connectors/greenhouse.ts` (and `lever.ts`, `ashby.ts`, `remoteok.ts`) with a minimal placeholder implementation each. These will be replaced in Tasks 3–6.

```typescript
import type { SourceConnector, RawJob, CanonicalJobInput } from "./types.js";

export const greenhouseConnector: SourceConnector = {
  type: "greenhouse",
  async fetchJobs(_token: string): Promise<RawJob[]> {
    return [];
  },
  toCanonicalJob(_raw: RawJob, _companyHint?: string): CanonicalJobInput {
    throw new Error("not implemented yet");
  },
};
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```
git add apps/server/src/services/source-connectors/
git commit -m "feat(server): scaffold SourceConnector abstraction with typed registry"
```

---

## Task 3: Greenhouse connector

**Files:**

- Modify: `apps/server/src/services/source-connectors/greenhouse.ts`
- Test: `apps/server/src/tests/source-connectors.test.ts`

**Interfaces:**

- Consumes: `fetch` from Node's global, `RawJob`/`CanonicalJobInput`/`SourceConnector` types
- Produces: `greenhouseConnector: SourceConnector`

Reference: Greenhouse public boards API

- List: `https://boards-api.greenhouse.io/v1/boards/{companyToken}/jobs`
- Detail: `https://boards-api.greenhouse.io/v1/boards/{companyToken}/jobs/{id}` (adds `content` HTML field)

Response shape (list):

```
{ jobs: [{ id, title, absolute_url, location: { name }, updated_at, ... }] }
```

- [ ] **Step 1: Write failing tests for `fetchJobs`**

Add to `apps/server/src/tests/source-connectors.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import nock from "nock";
import { greenhouseConnector } from "../services/source-connectors/greenhouse.js";

describe("greenhouse connector", () => {
  beforeEach(() => nock.cleanAll());
  afterEach(() => nock.cleanAll());

  it("fetches jobs from the boards-api list endpoint", async () => {
    nock("https://boards-api.greenhouse.io")
      .get("/v1/boards/acme/jobs")
      .reply(200, {
        jobs: [
          {
            id: 101,
            title: "Senior Engineer",
            absolute_url: "https://a.co/101",
            location: { name: "Remote" },
            updated_at: "2026-09-01T10:00:00Z",
          },
          {
            id: 102,
            title: "PM",
            absolute_url: "https://a.co/102",
            location: { name: "NYC" },
            updated_at: "2026-09-02T10:00:00Z",
          },
        ],
      });

    const jobs = await greenhouseConnector.fetchJobs("acme");
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      externalId: "101",
      title: "Senior Engineer",
      companyName: "acme",
    });
  });

  it("strips unlisted / non-listed jobs", async () => {
    nock("https://boards-api.greenhouse.io")
      .get("/v1/boards/acme/jobs")
      .reply(200, { jobs: [] });
    expect(await greenhouseConnector.fetchJobs("acme")).toEqual([]);
  });

  it("throws on HTTP error", async () => {
    nock("https://boards-api.greenhouse.io")
      .get("/v1/boards/bad/jobs")
      .reply(404);
    await expect(greenhouseConnector.fetchJobs("bad")).rejects.toThrow(/404/);
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `npm run test --workspace=job-tailor-server -- source-connectors`
Expected: FAIL — `not implemented yet` thrown.

- [ ] **Step 3: Implement `fetchJobs`**

Replace the stub in `apps/server/src/services/source-connectors/greenhouse.ts`:

```typescript
import type { SourceConnector, RawJob, CanonicalJobInput } from "./types.js";

const BASE = "https://boards-api.greenhouse.io/v1/boards";

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name?: string };
  updated_at?: string;
  first_published?: string;
  departments?: { name?: string }[];
  offices?: { name?: string }[];
}

export const greenhouseConnector: SourceConnector = {
  type: "greenhouse",

  async fetchJobs(token: string): Promise<RawJob[]> {
    const res = await fetch(`${BASE}/${encodeURIComponent(token)}/jobs`, {
      headers: {
        "User-Agent": process.env.BOT_USER_AGENT ?? "JobTailor-Bot/1.0",
      },
    });
    if (!res.ok) throw new Error(`Greenhouse ${token}: HTTP ${res.status}`);
    const body = (await res.json()) as { jobs?: GreenhouseJob[] };
    return (body.jobs ?? []).map((j) => ({
      externalId: String(j.id),
      url: j.absolute_url,
      title: j.title,
      companyName: token,
      locationText: j.location?.name,
      updatedAt: j.updated_at ? new Date(j.updated_at) : undefined,
      publishedAt: j.first_published ? new Date(j.first_published) : undefined,
      department: j.departments?.[0]?.name,
    }));
  },

  toCanonicalJob(_raw: RawJob, _companyHint?: string): CanonicalJobInput {
    throw new Error("not implemented yet — Task 3 continues");
  },
};
```

- [ ] **Step 4: Run tests, confirm they pass**

Run: `npm run test --workspace=job-tailor-server -- source-connectors`
Expected: PASS for the three greenhouse tests.

- [ ] **Step 5: Add detail-fetch and parse tests**

Append tests to `source-connectors.test.ts` — one test that fetches a detail page and one that parses a `RawJob` into `CanonicalJobInput` with HTML stripped:

```typescript
it("strips HTML and populates jdRawText", () => {
  const input = greenhouseConnector.toCanonicalJob({
    externalId: "1",
    url: "https://x/1",
    title: "T",
    companyName: "Acme",
    descriptionHtml: "<p>Build <strong>things</strong>.</p>",
  });
  expect(input.jdRawText).toBe("Build things.");
  expect(input.companyName).toBe("Acme");
});
```

- [ ] **Step 6: Implement `toCanonicalJob` with a small HTML-to-text helper**

Add to the same file:

```typescript
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
```

Replace the `toCanonicalJob` throw with:

```typescript
toCanonicalJob(raw: RawJob, companyHint?: string): CanonicalJobInput {
  return {
    title: raw.title,
    companyName: companyHint ?? raw.companyName,
    location: raw.locationText,
    jdRawText: htmlToText(raw.descriptionHtml ?? ''),
    sourceUrl: raw.url,
    externalId: raw.externalId,
    publishedAt: raw.publishedAt,
    updatedAt: raw.updatedAt,
    employmentType: raw.employmentType,
  };
},
```

- [ ] **Step 7: Add a `fetchJobDetail(token, id)` for on-demand body**

Greenhouse detail endpoint includes `content` (the full description HTML). Add to `greenhouse.ts`:

```typescript
export async function fetchJobDetail(
  token: string,
  id: string,
): Promise<RawJob> {
  const res = await fetch(
    `${BASE}/${encodeURIComponent(token)}/jobs/${encodeURIComponent(id)}`,
    {
      headers: {
        "User-Agent": process.env.BOT_USER_AGENT ?? "JobTailor-Bot/1.0",
      },
    },
  );
  if (!res.ok)
    throw new Error(`Greenhouse detail ${token}/${id}: HTTP ${res.status}`);
  const j = (await res.json()) as GreenhouseJob & { content?: string };
  return {
    externalId: String(j.id),
    url: j.absolute_url,
    title: j.title,
    companyName: token,
    locationText: j.location?.name,
    descriptionHtml: j.content,
    updatedAt: j.updated_at ? new Date(j.updated_at) : undefined,
    publishedAt: j.first_published ? new Date(j.first_published) : undefined,
  };
}
```

- [ ] **Step 8: Run tests + typecheck, commit**

```
npm run test --workspace=job-tailor-server -- source-connectors
npm run typecheck
git add apps/server/src/services/source-connectors/greenhouse.ts apps/server/src/tests/source-connectors.test.ts
git commit -m "feat(server): implement Greenhouse connector for live job discovery"
```

---

## Task 4: Lever connector

**Files:**

- Modify: `apps/server/src/services/source-connectors/lever.ts`
- Test: `apps/server/src/tests/source-connectors.test.ts` (append `lever connector` describe block)

**Interfaces:**

- Produces: `leverConnector: SourceConnector`

Reference: Lever Postings API

- List: `https://api.lever.co/v0/postings/{siteToken}?mode=json`
- Fields: `id`, `text`, `hostedUrl`, `categories.{location,team,commitment}`, `createdAt`, `descriptionPlain`

- [ ] **Step 1: Write failing tests**

Append to `source-connectors.test.ts`:

```typescript
describe("lever connector", () => {
  it("maps Lever postings to RawJob", async () => {
    nock("https://api.lever.co")
      .get("/v0/postings/acme?mode=json")
      .reply(200, [
        {
          id: "L1",
          text: "Engineer",
          hostedUrl: "https://jobs.lever.co/acme/L1",
          categories: {
            location: "Berlin",
            team: "Platform",
            commitment: "Full-time",
          },
          createdAt: 1726000000000,
        },
      ]);
    const jobs = await leverConnector.fetchJobs("acme");
    expect(jobs[0]).toMatchObject({
      externalId: "L1",
      title: "Engineer",
      locationText: "Berlin",
      team: "Platform",
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail** — expected FAIL.

- [ ] **Step 3: Implement `lever.ts`**

```typescript
import type { SourceConnector, RawJob, CanonicalJobInput } from "./types.js";
import { htmlToText } from "./utils/html.js";

const BASE = "https://api.lever.co/v0/postings";

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  categories?: { location?: string; team?: string; commitment?: string };
  createdAt?: number;
  descriptionPlain?: string;
  descriptionList?: { content: string }[];
}

export const leverConnector: SourceConnector = {
  type: "lever",

  async fetchJobs(token: string): Promise<RawJob[]> {
    const res = await fetch(`${BASE}/${encodeURIComponent(token)}?mode=json`, {
      headers: {
        "User-Agent": process.env.BOT_USER_AGENT ?? "JobTailor-Bot/1.0",
      },
    });
    if (!res.ok) throw new Error(`Lever ${token}: HTTP ${res.status}`);
    const list = (await res.json()) as LeverPosting[];
    return list.map((p) => ({
      externalId: p.id,
      url: p.hostedUrl,
      title: p.text,
      companyName: token,
      locationText: p.categories?.location,
      team: p.categories?.team,
      employmentType: p.categories?.commitment,
      publishedAt: p.createdAt ? new Date(p.createdAt) : undefined,
    }));
  },

  toCanonicalJob(raw: RawJob, companyHint?: string): CanonicalJobInput {
    return {
      title: raw.title,
      companyName: companyHint ?? raw.companyName,
      location: raw.locationText,
      jdRawText: htmlToText(raw.descriptionHtml ?? ""),
      sourceUrl: raw.url,
      externalId: raw.externalId,
      publishedAt: raw.publishedAt,
      employmentType: raw.employmentType,
    };
  },
};
```

- [ ] **Step 4: Extract `htmlToText` into a shared util**

Create `apps/server/src/services/source-connectors/utils/html.ts` containing the `htmlToText` function from Task 3. Update `greenhouse.ts` to `import { htmlToText } from './utils/html.js'` and delete its local copy.

- [ ] **Step 5: Run tests + typecheck, commit**

```
npm run test --workspace=job-tailor-server -- source-connectors
git add apps/server/src/services/source-connectors/ apps/server/src/tests/source-connectors.test.ts
git commit -m "feat(server): implement Lever connector for live job discovery"
```

---

## Task 5: Ashby connector

**Files:**

- Modify: `apps/server/src/services/source-connectors/ashby.ts`
- Test: `apps/server/src/tests/source-connectors.test.ts`

Reference: Ashby Posting API

- `https://api.ashbyhq.com/posting-api/job-board/{orgName}?includeCompensation=true`
- Response: `{ jobs: [{ id, title, location, secondaryLocations[], department, team, descriptionHtml, jobUrl, publishedAt, isListed, employmentType }] }`

- [ ] **Step 1: Write failing test**

```typescript
describe("ashby connector", () => {
  it("fetches listed jobs and skips unlisted", async () => {
    nock("https://api.ashbyhq.com")
      .get("/posting-api/job-board/acme?includeCompensation=true")
      .reply(200, {
        jobs: [
          {
            id: "A1",
            title: "SWE",
            location: "SF",
            department: "Eng",
            team: "API",
            jobUrl: "https://a.co/jobs/A1",
            descriptionHtml: "<p>hi</p>",
            publishedAt: "2026-09-01T00:00:00Z",
            isListed: true,
            employmentType: "FULL_TIME",
          },
          {
            id: "A2",
            title: "Hidden",
            isListed: false,
            jobUrl: "",
            location: "",
          },
        ],
      });
    const jobs = await ashbyConnector.fetchJobs("acme");
    expect(jobs.map((j) => j.externalId)).toEqual(["A1"]);
  });
});
```

- [ ] **Step 2: Run to confirm FAIL** — expected.

- [ ] **Step 3: Implement `ashby.ts`**

```typescript
import type { SourceConnector, RawJob, CanonicalJobInput } from "./types.js";
import { htmlToText } from "./utils/html.js";

const BASE = "https://api.ashbyhq.com/posting-api/job-board";

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  department?: string;
  team?: string;
  jobUrl: string;
  descriptionHtml?: string;
  publishedAt?: string;
  isListed?: boolean;
  employmentType?: string;
}

export const ashbyConnector: SourceConnector = {
  type: "ashby",
  async fetchJobs(token: string): Promise<RawJob[]> {
    const res = await fetch(
      `${BASE}/${encodeURIComponent(token)}?includeCompensation=true`,
      {
        headers: {
          "User-Agent": process.env.BOT_USER_AGENT ?? "JobTailor-Bot/1.0",
        },
      },
    );
    if (!res.ok) throw new Error(`Ashby ${token}: HTTP ${res.status}`);
    const body = (await res.json()) as { jobs?: AshbyJob[] };
    return (body.jobs ?? [])
      .filter((j) => j.isListed !== false)
      .map((j) => ({
        externalId: j.id,
        url: j.jobUrl,
        title: j.title,
        companyName: token,
        locationText: j.location,
        department: j.department,
        team: j.team,
        employmentType: j.employmentType,
        descriptionHtml: j.descriptionHtml,
        publishedAt: j.publishedAt ? new Date(j.publishedAt) : undefined,
      }));
  },
  toCanonicalJob(raw: RawJob, companyHint?: string): CanonicalJobInput {
    return {
      title: raw.title,
      companyName: companyHint ?? raw.companyName,
      location: raw.locationText,
      jdRawText: htmlToText(raw.descriptionHtml ?? ""),
      sourceUrl: raw.url,
      externalId: raw.externalId,
      publishedAt: raw.publishedAt,
      employmentType: raw.employmentType,
    };
  },
};
```

- [ ] **Step 4: Test + typecheck, commit**

```
git add apps/server/src/services/source-connectors/ashby.ts apps/server/src/tests/source-connectors.test.ts
git commit -m "feat(server): implement Ashby connector for live job discovery"
```

---

## Task 6: RemoteOK RSS connector

**Files:**

- Modify: `apps/server/src/services/source-connectors/remoteok.ts`
- Test: `apps/server/src/tests/source-connectors.test.ts`

Reference: RemoteOK public JSON feed at `https://remoteok.com/api` returns an array of postings. No auth.

Note: The RemoteOK feed's schema changes periodically. This connector must be resilient: skip malformed entries, log with `errorCount += 1` on batch.

- [ ] **Step 1: Write failing test with 2 valid entries + 1 malformed**

```typescript
describe("remoteok connector", () => {
  it("parses valid entries, skips malformed", async () => {
    nock("https://remoteok.com")
      .get("/api")
      .reply(200, [
        {
          position: "Dev",
          company: "Acme",
          location: "Remote",
          url: "https://remoteok.com/l/1",
          description: "<p>hi</p>",
          published_at: "2026-09-01T00:00:00Z",
          tags: ["full-time"],
        },
        {
          position: "Designer",
          company: "Beta",
          location: "EU",
          url: "https://remoteok.com/l/2",
        },
        {},
      ]);
    const jobs = await remoteokConnector.fetchJobs("_");
    expect(jobs).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to confirm FAIL.**

- [ ] **Step 3: Implement `remoteok.ts`**

```typescript
import type { SourceConnector, RawJob, CanonicalJobInput } from "./types.js";
import { htmlToText } from "./utils/html.js";

interface RemoteOkJob {
  position?: string;
  company?: string;
  location?: string;
  url?: string;
  description?: string;
  published_at?: string;
  tags?: string[];
}

export const remoteokConnector: SourceConnector = {
  type: "remoteok",
  async fetchJobs(_token: string): Promise<RawJob[]> {
    const res = await fetch("https://remoteok.com/api", {
      headers: {
        "User-Agent": process.env.BOT_USER_AGENT ?? "JobTailor-Bot/1.0",
      },
    });
    if (!res.ok) throw new Error(`RemoteOK: HTTP ${res.status}`);
    const list = (await res.json()) as RemoteOkJob[];
    return list
      .filter((j) => j.position && j.company && j.url)
      .map((j) => ({
        externalId: j.url!,
        url: j.url!,
        title: j.position!,
        companyName: j.company!,
        locationText: j.location,
        descriptionHtml: j.description,
        publishedAt: j.published_at ? new Date(j.published_at) : undefined,
        employmentType: j.tags?.[0],
      }));
  },
  toCanonicalJob(raw: RawJob, companyHint?: string): CanonicalJobInput {
    return {
      title: raw.title,
      companyName: companyHint ?? raw.companyName,
      location: raw.locationText,
      jdRawText: htmlToText(raw.descriptionHtml ?? ""),
      sourceUrl: raw.url,
      externalId: raw.externalId,
      publishedAt: raw.publishedAt,
      employmentType: raw.employmentType,
    };
  },
};
```

- [ ] **Step 4: Test + commit**

```
git commit -am "feat(server): implement RemoteOK connector for live job discovery"
```

---

## Task 7: Extend IJobIngestionInput and reuse ingestJob

**Files:**

- Modify: `packages/shared-types/src/index.ts:375` (`IJobIngestionInput`)
- Modify: `apps/server/src/services/ingestion.service.ts` (accept `sourceId` hint, skip LLM path for `api_connector`)
- Test: `apps/server/src/tests/search-engine.test.ts` (append)

**Interfaces:**

- Produces: `IJobIngestionInput.sourceId?: string` and `IJobIngestionInput.sourceType` extended with `'api_connector'`

Rationale: the existing `ingestJob(input)` already handles L1/L2/L3 dedup, `CanonicalJob` creation, and alert dispatch. Instead of adding a parallel `ingestFromConnector` method, we widen the input type. When `sourceType === 'api_connector'`, the service trusts the caller's `structuredJD` field (which the poller leaves undefined) and skips the LLM parse path entirely — cost stays tied to user view-time (Task 13), not crawl volume.

- [ ] **Step 1: Extend `IJobIngestionInput` in shared-types**

```typescript
export interface IJobIngestionInput {
  sourceType: "manual_paste" | "public_job_page" | "api_connector";
  sourceName: string;
  sourceId?: string; // NEW: explicit registry link (poller passes this)
  sourceUrl?: string;
  applyUrl?: string;
  companyName: string;
  jobTitle: string;
  location?: string;
  workType?: "remote" | "hybrid" | "onsite";
  employmentType?: "full-time" | "part-time" | "contract" | "internship";
  description: string;
  rawHtmlSnapshot?: string;
  postedDate?: Date;
  structuredJD?: IParsedJD; // already present; poller leaves it undefined
}
```

- [ ] **Step 2: Update `ingestJob` source resolution**

In `apps/server/src/services/ingestion.service.ts` at the source-resolution block (around line 88–109), add a first branch:

```typescript
if (input.sourceType === "api_connector" && input.sourceId) {
  source = await SourceRegistry.findById(input.sourceId).lean();
  if (!source)
    throw new Error(
      `api_connector ingest requires a valid sourceId: ${input.sourceId}`,
    );
} else if (input.sourceType === "manual_paste") {
  /* existing */
} else {
  /* existing */
}
```

Also update the `extractionConfidence` ternary: `api_connector` rows get `0.9` (higher than public HTML scraping because we're reading a first-party API).

- [ ] **Step 3: Write failing test**

```typescript
it("creates a CanonicalJob for api_connector source without calling the LLM parser", async () => {
  const parseSpy = vi.spyOn(
    await import("../services/jd-parser.service.js"),
    "parseJD",
  );
  const source = await SourceRegistry.create({
    name: "Acme (Greenhouse)",
    sourceType: "api_connector",
    connectorType: "greenhouse",
    companyId: "acme",
    baseUrl: "https://boards-api.greenhouse.io",
    crawlFrequency: 360,
    extractionStrategy: "manual_input",
  });
  const job = await IngestionService.ingestJob({
    sourceType: "api_connector",
    sourceName: source.name,
    sourceId: String(source._id),
    companyName: "Acme",
    jobTitle: "Senior Engineer",
    location: "Remote",
    description: "Do engineering.",
    sourceUrl: "https://gh/acme/1",
    applyUrl: "https://gh/acme/1",
  });
  expect(job.sourceId?.toString()).toBe(source._id.toString());
  expect(job.structuredJD).toBeUndefined(); // no LLM called at ingest time
  expect(parseSpy).not.toHaveBeenCalled();
  parseSpy.mockRestore();
});
```

- [ ] **Step 4: Run to confirm PASS.**

Run: `npm run test --workspace=job-tailor-server -- search-engine`
Expected: all 21 existing tests + 1 new test pass.

- [ ] **Step 5: Typecheck + commit**

```
git add packages/shared-types/src/index.ts apps/server/src/services/ingestion.service.ts apps/server/src/tests/search-engine.test.ts
git commit -m "feat(server): allow api_connector sourceType in ingestJob"
```

---

## Task 8: Source poller service

**Files:**

- Create: `apps/server/src/services/source-poller.service.ts`
- Create: `apps/server/src/services/source-poller.util.ts` (tiny concurrency pool helper)
- Test: `apps/server/src/tests/source-poller.test.ts`

**Interfaces:**

- Produces: `pollSource(sourceId: string): Promise<PollResult>`
- Produces: `pollDueSources(): Promise<PollSummary>`
- Consumes: `CleanupService.decaySourceTrust` / `boostSourceTrust` (Task 4 exists; reuse rather than re-implementing trust writes)
- Consumes: `runWithConcurrency<T, R>(items: T[], limit: number, worker: (t: T) => Promise<R>): Promise<R[]>` from the util file

```typescript
export interface PollResult {
  sourceId: string;
  fetched: number;
  created: number;
  updated: number;
  duplicates: number;
  failed: number;
  error?: string;
}
export interface PollSummary {
  due: number;
  polled: number;
  results: PollResult[];
}
```

- [ ] **Step 1: Write the concurrency pool helper first**

Create `apps/server/src/services/source-poller.util.ts`:

```typescript
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function next(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, next),
  );
  return results;
}
```

- [ ] **Step 2: Write failing tests for the pool + poller**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import nock from "nock";
import mongoose from "mongoose";
import { SourceRegistry } from "../models/SourceRegistry.model.js";
import { CanonicalJob } from "../models/CanonicalJob.model.js";
import {
  pollSource,
  pollDueSources,
} from "../services/source-poller.service.js";
import { runWithConcurrency } from "../services/source-poller.util.js";
import { connectTestDb, disconnectTestDb } from "./helpers/test-db.js";

beforeEach(async () => {
  await connectTestDb();
});
afterEach(async () => {
  nock.cleanAll();
  await mongoose.connection.dropDatabase();
  await disconnectTestDb();
});

describe("runWithConcurrency", () => {
  it("runs at most N workers in flight", async () => {
    let running = 0,
      max = 0;
    await runWithConcurrency(Array(10).fill(0), 3, async () => {
      running++;
      max = Math.max(max, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
    });
    expect(max).toBeLessThanOrEqual(3);
  });
});

describe("source-poller", () => {
  it("boosts trust +0.01 via CleanupService on successful poll", async () => {
    /* ... */
  });
  it("decays trust -0.05 via CleanupService on fetch failure", async () => {
    /* ... */
  });
  it("disables source when errorCount reaches 5", async () => {
    /* ... */
  });
  it("resets errorCount to 0 on next success", async () => {
    /* ... */
  });
  it("pollDueSources returns empty when nothing is due", async () => {
    /* ... */
  });
});
```

- [ ] **Step 2: Run to confirm FAIL.**

- [ ] **Step 3: Implement `source-poller.service.ts`**

Key structure:

```typescript
export async function pollSource(sourceId: string): Promise<PollResult> {
  const src = await SourceRegistry.findById(sourceId).lean();
  if (!src || !src.connectorType) return emptyResult(sourceId);
  const connector = getConnector(src.connectorType);
  const empty = {
    sourceId,
    fetched: 0,
    created: 0,
    updated: 0,
    duplicates: 0,
    failed: 0,
  };
  try {
    const raws = await connector.fetchJobs(src.companyId ?? "_");
    let created = 0,
      duplicates = 0,
      failed = 0;
    for (const raw of raws) {
      try {
        const input = connector.toCanonicalJob(raw, src.name);
        const before = await CanonicalJob.findOne({
          applyUrl: input.sourceUrl,
        });
        await IngestionService.ingestJob({
          sourceType: "api_connector",
          sourceName: src.name,
          sourceId: String(src._id),
          companyName: input.companyName,
          jobTitle: input.title,
          location: input.location,
          description: input.jdRawText,
          sourceUrl: input.sourceUrl,
          applyUrl: input.sourceUrl,
          employmentType: input.employmentType as any,
          postedDate: input.publishedAt,
        });
        if (before) duplicates++;
        else created++;
      } catch {
        failed++;
      }
    }
    await SourceRegistry.updateOne(
      { _id: sourceId },
      {
        $set: { lastPolledAt: new Date(), errorCount: 0, lastError: undefined },
      },
    );
    await CleanupService.boostSourceTrust(sourceId, 0.01);
    return { ...empty, fetched: raws.length, created, duplicates, failed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await SourceRegistry.updateOne(
      { _id: sourceId },
      {
        $inc: { errorCount: 1 },
        $set: { lastError: message, lastPolledAt: new Date() },
      },
    );
    await CleanupService.decaySourceTrust(sourceId, 0.05);
    // Circuit breaker: disable at 5 consecutive errors
    await SourceRegistry.updateOne(
      { _id: sourceId, errorCount: { $gte: 5 } },
      { $set: { isEnabled: false } },
    );
    return { ...empty, error: message };
  }
}

export async function pollDueSources(): Promise<PollSummary> {
  const now = Date.now();
  const sources = await SourceRegistry.find({
    isEnabled: true,
    connectorType: { $ne: null },
  }).lean();
  const due = sources.filter((s) => {
    const last = s.lastPolledAt?.getTime() ?? 0;
    return (now - last) / 60000 >= (s.crawlFrequency || 360);
  });
  const results = await runWithConcurrency(due, 5, (s) =>
    pollSource(String(s._id)),
  );
  return { due: due.length, polled: results.length, results };
}
```

- [ ] **Step 4: Run tests to confirm PASS.**

- [ ] **Step 5: Commit**

```
git commit -am "feat(server): add source-poller with trust decay and circuit breaker"
```

---

## Task 9: Source seed service

**Files:**

- Create: `apps/server/src/services/source-seed.service.ts`
- Test: `apps/server/src/tests/source-seed.test.ts`

**Interfaces:**

- Produces: `seedSources(items: SeedItem[]): Promise<SeedSummary>` — upserts SourceRegistry rows by `(name, connectorType, companyId)`.

```typescript
export interface SeedItem {
  name: string; // human label, e.g. "Stripe (Greenhouse)"
  connectorType: SourceConnectorType;
  companyId: string; // e.g. "stripe"
  crawlFrequency?: number; // default 360 min
}
```

- [ ] **Step 1: Write failing tests** — cover new insert, idempotent re-run, mixed batch.

- [ ] **Step 2: Implement** — upsert via `SourceRegistry.updateOne({ connectorType, companyId }, { $setOnInsert: { ...defaults, ...item } }, { upsert: true })`.

- [ ] **Step 3: Test + commit.**

---

## Task 10: Admin auth middleware + admin routes

**Files:**

- Create: `apps/server/src/middleware/admin-auth.ts`
- Create: `apps/server/src/routes/admin.routes.ts`
- Create: `apps/server/src/controllers/admin.controller.ts`
- Modify: `apps/server/src/app.ts` (mount the router)
- Modify: `apps/server/src/config/index.ts` (add `SOURCE_POLL_ADMIN_KEY`)

**Interfaces:**

- Produces: `requireAdminKey` middleware
- Produces: `POST /api/v1/admin/poll-due-sources`, `POST /api/v1/admin/seed-sources`
- Zod schema enforces `companyId: z.string().regex(/^[a-z0-9][a-z0-9-]{1,50}$/)` — protects against SSRF if a later refactor swaps to URL-based fetch, and prevents obviously-malformed tokens from being seeded

- [ ] **Step 1: Implement middleware**

```typescript
import { Request, Response, NextFunction } from "express";
export function requireAdminKey(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const key = req.header("x-admin-key");
  const expected = process.env.SOURCE_POLL_ADMIN_KEY;
  if (!expected)
    return res
      .status(503)
      .json({ success: false, error: { code: "ADMIN_NOT_CONFIGURED" } });
  if (key !== expected)
    return res
      .status(401)
      .json({ success: false, error: { code: "UNAUTHORIZED_ADMIN" } });
  next();
}
```

- [ ] **Step 2: Zod schema for seed payload**

```typescript
import { z } from "zod";
export const seedSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().min(2).max(120),
        connectorType: z.enum(["greenhouse", "lever", "ashby", "remoteok"]),
        companyId: z
          .string()
          .regex(/^[a-z0-9][a-z0-9-]{1,50}$/, "invalid token format"),
        crawlFrequency: z.number().int().min(30).max(10080).optional(),
      }),
    )
    .min(1)
    .max(500),
});
```

- [ ] **Step 3: Controller** — two handlers, envelope response.

- [ ] **Step 4: Routes** — mount `POST /poll-due-sources` and `POST /seed-sources` behind `requireAdminKey` + `validateBody(seedSchema)`.

- [ ] **Step 5: Mount `/api/v1/admin` in `app.ts`.**

- [ ] **Step 6: Integration test** — cover unauthorized (401), malformed companyId (`../../etc/passwd` → 400), valid seed (201).

- [ ] **Step 7: Commit.**

---

## Task 11: Seed companies JSON + bootstrap script

**Files:**

- Create: `data/seed-companies.json` (~30 entries)
- Create: `scripts/seed-sources.mjs` (a small Node CLI that POSTs the JSON to the admin endpoint)

- [ ] **Step 1: Write `data/seed-companies.json`**

Sample entries (verify tokens resolve before shipping):

```json
[
  { "name": "GitLab", "connectorType": "greenhouse", "companyId": "gitlab" },
  { "name": "Airbnb", "connectorType": "greenhouse", "companyId": "airbnb" },
  { "name": "Datadog", "connectorType": "greenhouse", "companyId": "datadog" },
  { "name": "Plaid", "connectorType": "lever", "companyId": "plaid" },
  { "name": "Linear", "connectorType": "ashby", "companyId": "linear" },
  { "name": "Notion", "connectorType": "ashby", "companyId": "notion" },
  { "name": "RemoteOK Firehose", "connectorType": "remoteok", "companyId": "_" }
]
```

Ship 20–40 real tokens.

- [ ] **Step 2: Bootstrap CLI `scripts/seed-sources.mjs`**

Reads the JSON, POSTs to `<API_BASE>/admin/seed-sources` with `x-admin-key`, then calls `poll-due-sources` once.

- [ ] **Step 3: Document usage in `docs/development-guide.md` (a "Seeding job sources" section).**

- [ ] **Step 4: Commit.**

---

## Task 12: Scheduled GitHub Action

**Files:**

- Create: `.github/workflows/poll-sources.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: Poll job sources
on:
  schedule:
    - cron: "0 */6 * * *"
  workflow_dispatch:
jobs:
  poll:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger poll
        run: |
          curl -fsS -X POST "${{ secrets.JOBTAILOR_API_BASE }}/api/v1/admin/poll-due-sources" \
            -H "x-admin-key: ${{ secrets.SOURCE_POLL_ADMIN_KEY }}"
```

- [ ] **Step 2: Document required secrets in `SETUP.md`.**

- [ ] **Step 3: Commit.**

---

## Task 13: On-demand JD parse on job view

**Files:**

- Modify: `apps/server/src/controllers/job.controller.ts` (or CanonicalJob controller)
- Modify: `apps/client/src/pages/JobsPage.tsx`

Rationale: the poller intentionally skips LLM parsing. When the user views a job, `POST /jobs/:id/parse` runs; result is cached on `structuredJD`. The trigger check is simply `!job.structuredJD` — no new boolean field needed.

- [ ] **Step 1: Job detail response includes `structuredJD` (or `null` if not yet parsed).**
- [ ] **Step 2: Client: when opening a job where `!job.structuredJD && job.description.length > 50`, auto-fire the existing parse mutation.**
- [ ] **Step 3: Integration test for the flow.**
- [ ] **Step 4: Commit.**

---

## Task 14: End-to-end smoke test + MVP_STATUS update

**Files:**

- Test: `apps/server/src/tests/live-job-discovery.e2e.test.ts`
- Modify: `MVP_STATUS.md`

- [ ] **Step 1: Write the e2e test** — seed 2 fake sources via admin route (nock their HTTP), call `poll-due-sources`, verify CanonicalJob count grows, verify re-poll is dedup-clean, verify trust decay on failure.

- [ ] **Step 2: Run full server suite: `npm run test --workspace=job-tailor-server` — all pass.**

- [ ] **Step 3: Update `MVP_STATUS.md` "Live job discovery" entry from "PENDING" to a short paragraph describing what shipped.**

- [ ] **Step 4: Update `TODO_PLAN.md` to check off Tier 1 Feature 1 sub-tasks.**

- [ ] **Step 5: Commit.**

---

## Self-Review (v2, after code cross-check)

**Findings resolved in this revision:**

1. Task 7 rewritten — reuse existing `IngestionService.ingestJob(input)` by widening `IJobIngestionInput` with `sourceId?` + `'api_connector'`, instead of inventing a parallel `ingestFromConnector` method.
2. Field naming fixed throughout — CanonicalJob uses `structuredJD`, not `parsedJD`.
3. `needsParsing` flag removed — `!structuredJD` is the check (Task 13 updated).
4. Task 8 reuses `CleanupService.decaySourceTrust` / `boostSourceTrust` instead of re-implementing trust writes.
5. Task 8 uses an inline `runWithConcurrency` pool (Step 1) — the `Promise.all` bug is fixed.
6. Task 10 validates `companyId` shape via Zod (`/^[a-z0-9][a-z0-9-]{1,50}$/`) — closes the token-injection concern before it reaches fetch.

**Remaining placeholders to expand at execution time:** the source-poller tests in Task 8 Step 2 (`/* ... */`) and Task 9's seed-service tests. The plan names each behavior; the executor writes the body. Not a plan defect — a checkpoint where the executor's test design matters more than prescriptive code.

**Dependencies:** plan assumes no new runtime npm packages. `nock` for HTTP mocking is added as a dev dependency in Task 3 if not already present. Verify before Task 3 with `grep nock apps/server/package.json`.

## Execution Handoff

Plan complete. Two options for how to run it:

1. **Subagent-driven (recommended)** — one fresh subagent per task, review between tasks; each task's diff is small enough to reason about independently.
2. **Inline execution** — batch tasks inside this session with checkpoints.

**Which one?** Also: do you want Plans 2 and 3 (Chrome extension, ATS upgrade) written now, or after this one has been executed at least partially?
