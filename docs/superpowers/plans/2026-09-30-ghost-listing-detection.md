# Ghost-Listing Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tag each live `CanonicalJob` with a deterministic, advisory 0–1 `ghostRisk` score plus human-readable reasons, demote risky listings in search and feed ranking, and let the user override the verdict — so the user stops spending tailors and applications on evergreen postings that were never really open.

**Architecture:** A pure scoring function (`ghost-job.service.ts`) computes risk from fields already in the database; no new fetches, no LLM. A daily sweep step (after the existing link check) persists the verdict onto each listing, and the ranking layer applies one multiplicative demotion. User verdicts are recorded through the existing search-feedback endpoint and always win over the model. Nothing is ever hard-filtered or deleted by default.

**Tech Stack:** Node 22, TypeScript 5.8 (strict), Express 5, Mongoose 8, Zod 4, Vitest 3 with `mongodb-memory-server`, React 19 + TanStack Query 5 on the client, `node-cron` for the sweep. No new runtime dependencies.

**Spec:** `TODO_PLAN.md` · item **#16 — Ghost-Listing Detection and Tagging** (Tier 2, ranked above #6). This plan also implements #16's recorded prerequisite: the ingestion text-drift fix.

## Global Constraints

- LLM cost stays bounded to user view-time: **no LLM call** in ingestion, polling, ranking, or the daily sweep. Every signal in this plan is computed from stored data.
- The verdict is **advisory only**: tag, demote, let the user override. Never set `isActive: false`, never widen the `verificationState` enum, never auto-delete. `failed`/`suspicious` are hard-excluded at `services/search.service.ts:47` and `services/feed.service.ts:49`, so reusing that enum would silently hide real jobs.
- Every field added to a Mongoose document must be declared in **both** the schema in `models/CanonicalJob.model.ts` and `ICanonicalJob` in `packages/shared-types/src/index.ts:353-376` — strict mode strips undeclared paths. Reference failure mode: `expiredAt` is declared on the interface (`models/CanonicalJob.model.ts:24`) but has no schema path, so the writes at `services/cleanup.service.ts:72`, `:149`, `:182` are silently dropped today. Do not repeat that pattern.
- Secrets are never logged; `pino` redaction config is unchanged by this feature.
- Tests that touch the database run with `npx vitest run --no-file-parallelism <files>` (concurrent upserts race otherwise).
- Gates before any commit: `npx turbo run typecheck lint test --force --concurrency=1` from the repo root. `--force` is required because turbo otherwise replays cached output and proves nothing; `--concurrency=1` is required because the full fan-out OOM-aborts (exit 134) on an 8 GB machine.
- Commit messages: Conventional Commits, **every body line ≤ 100 characters** or commitlint kills the commit. Never `git add .qoder/`. Never `--no-verify`.
- Prettier runs through lint-staged on commit; run `npx prettier --write <files>` on anything authored here first so the hook is a no-op.
- Coverage floors (55/50/59/55) change only with a fresh measurement in hand.
- Documentation baseline: as of 2026-09-30 the suite is **231 tests** (server 200 / 30 files, extension 26 / 3, client 5 / 2) with lint at 0 errors (248 warnings). Task 9 updates this line with the post-feature measurement.

## Evidence Base (verified, not assumed)

All of the following was measured on 2026-09-30 against live payloads and the current tree; the plan's design depends on it.

| Claim                                                                 | Evidence                                                                                                                                                                                                                |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Greenhouse `application_deadline` exists but is unpopulated           | 9 job details across boards `gitlab`, `datadog`, `airbnb`: every value `null`. Treat as an opportunistic corroborator, never a signal.                                                                                  |
| Greenhouse `updated_at` carries no per-job information                | All jobs on a board share one timestamp (gitlab `2026-09-29T10:38:50-04:00`, datadog `13:18:57`, airbnb `20:00:54`). Excluded from scoring.                                                                             |
| Greenhouse `first_published` is genuinely per-job and can be very old | datadog `6572669` first published `2025-01-24`, `7194969` `2025-08-27`, still listed 2026-09-30.                                                                                                                        |
| `requisition_id` is not a unique identity                             | airbnb returns the literal `"ONE"` / `"MULTI"` for multiple roles. Not used as a dedupe or churn key.                                                                                                                   |
| Re-sighting refreshes only `lastSeenAt` / `isActive`                  | `services/ingestion.service.ts:163-169`; incoming `description`, `descriptionHash` and `salaryRange` are never written, and new rows store `salaryRange: undefined` (`:198`). This is Task 1.                           |
| Repost churn is already countable                                     | L1/L2/L3 duplicate lookups are scoped `isActive: true` (`services/deduplication.service.ts:54`, `:63`, `:72`), and `models/CanonicalJob.model.ts:106` carries the `{ companyName, jobTitle, location }` compound index. |
| The sweep rewards ghosts                                              | `services/cleanup.service.ts:161-168` writes `verified` and boosts trust +0.01 on any non-404 ping.                                                                                                                     |
| Feedback path to extend                                               | enum at `routes/search.routes.ts:139` (`flag_expired                                                                                                                                                                    | flag_spam`), whitelist at `controllers/analytics.controller.ts:386`, model enum at `models/JobInteractionLog.model.ts:27`. |
| Line references in `TODO_PLAN.md` shifted                             | `ingestion.service.ts:160-169` is now `:163-169` and `:195` is now `:198` after the 2026-09-30 `employmentType` fix added one import line. Task 9 corrects the roadmap text.                                            |

Sample size is small and self-selected. Say so in the UI copy and in `docs`: this feature estimates staleness, it does not prove fraud.

## File Structure

| File                                                                                                                                                   | Responsibility                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/server/src/services/ingestion.service.ts`                                                                                                        | Modify: re-sighting writes changed text + hash, counts changes (Task 1).                                                                                                                                                                                         |
| `apps/server/src/scripts/ghost-baseline.ts`                                                                                                            | Create: one-off measurement script, run manually, output pasted into this plan (Task 2).                                                                                                                                                                         |
| `apps/server/src/models/CanonicalJob.model.ts`                                                                                                         | Modify: schema paths `descriptionHashChanges`, `ghostRisk`, `ghostReasons`, `ghostEvaluatedAt`, `userGhostVerdict` (Tasks 1, 3).                                                                                                                                 |
| `packages/shared-types/src/index.ts`                                                                                                                   | Modify: mirror every new path on `ICanonicalJob` (Tasks 1, 3).                                                                                                                                                                                                   |
| `apps/server/src/services/ghost-job.service.ts`                                                                                                        | Create: pure `scoreGhostSignals()` + `GhostVerdict`/`GhostSignals` types + `applyGhostScoring()` sweep writer (Tasks 4, 5).                                                                                                                                      |
| `apps/server/src/tests/fixtures/ghost-golden-cases.json`                                                                                               | Create: hand-computed expected risk per case (Task 4).                                                                                                                                                                                                           |
| `apps/server/src/jobs/stale-cleanup.job.ts`                                                                                                            | Modify: call `applyGhostScoring()` after the link check (Task 5).                                                                                                                                                                                                |
| `apps/server/src/services/search.service.ts`, `services/feed.service.ts`                                                                               | Modify: demotion factor, opt-in `hideGhosts` filter (Task 6).                                                                                                                                                                                                    |
| `apps/server/src/routes/search.routes.ts`, `controllers/analytics.controller.ts`, `models/JobInteractionLog.model.ts`, `services/analytics.service.ts` | Modify: `still_hiring` verdict and `userGhostVerdict` write (Task 7).                                                                                                                                                                                            |
| `apps/client/src/components/GhostChip.tsx`                                                                                                             | Create: the advisory tag (Task 8).                                                                                                                                                                                                                               |
| `apps/client/src/pages/JobsPage.tsx`                                                                                                                   | Modify: chip in result cards (`:1081`, `:1227` render `job.sourceName`), the `hideGhosts` toggle, and the "Likely stale" column of the in-page Quality Dashboard (`:1294-1301` header, `:1534` `sourceHealth` rows). There is **no** `QualityDashboardPage.tsx`. |
| `apps/client/src/api.ts` / `queryKeys.ts`                                                                                                              | Modify: pass `hideGhosts` and key the two result views apart (Task 8).                                                                                                                                                                                           |
| `apps/server/src/services/analytics.service.ts:119-141`                                                                                                | Modify: add `ghostTagged` per source to the `sourceHealth` payload (Task 8).                                                                                                                                                                                     |
| `docs/api-reference.md`, `TODO_PLAN.md`                                                                                                                | Modify: feedback enum, feature checkboxes, verification baseline (Task 9).                                                                                                                                                                                       |

---

### Task 1: Re-sighting refreshes text and counts drift (prerequisite)

**Files:**

- Modify: `apps/server/src/services/ingestion.service.ts:163-169`
- Modify: `apps/server/src/models/CanonicalJob.model.ts` (after `:85`)
- Modify: `packages/shared-types/src/index.ts` (`ICanonicalJob`, after `:372`)
- Test: `apps/server/src/tests/ingestion-connector.test.ts`

**Interfaces:**

- Consumes: existing `IngestionService.ingestJob(input: IJobIngestionInput)`, `DeduplicationService.generateDescriptionHash()`.
- Produces: `CanonicalJob.descriptionHashChanges: number` (default 0) — read by the Task 4 scorer and asserted by Task 5.

- [ ] **Step 1: Write the failing test** — append inside the `IngestionService — api_connector source type` describe in `apps/server/src/tests/ingestion-connector.test.ts`:

```ts
it("refreshes stored text and counts drift when a re-sighting changed", async () => {
  const base = {
    sourceType: "api_connector" as const,
    sourceName: "Acme (Greenhouse)",
    sourceId: String(testSource._id),
    companyName: "Acme",
    jobTitle: "Senior Engineer",
    location: "Remote",
    sourceUrl: "https://gh/acme/drift",
    applyUrl: "https://gh/acme/drift",
  };

  const first = await IngestionService.ingestJob({
    ...base,
    description: "Original body text describing the work.",
  });
  expect(first.descriptionHashChanges).toBe(0);

  const same = await IngestionService.ingestJob({
    ...base,
    description: "Original body text describing the work.",
  });
  expect(String(same._id)).toBe(String(first._id));
  expect(same.descriptionHashChanges).toBe(0);

  const changed = await IngestionService.ingestJob({
    ...base,
    description: "Rewritten body text describing different work.",
  });
  expect(String(changed._id)).toBe(String(first._id));
  expect(changed.description).toBe(
    "Rewritten body text describing different work.",
  );
  expect(changed.descriptionHashChanges).toBe(1);
});
```

- [ ] **Step 2: Run it and verify it fails for the right reason**

Run: `cd apps/server && npx vitest run src/tests/ingestion-connector.test.ts`
Expected: FAIL — `expected undefined to be 0` on `descriptionHashChanges` (path does not exist yet, strict mode strips it).

- [ ] **Step 3: Add the schema path** in `apps/server/src/models/CanonicalJob.model.ts`, immediately after the `descriptionHash` line (`:85`):

```ts
    descriptionHashChanges: { type: Number, default: 0 },
```

and on the document interface, next to the existing `descriptionHash?: string;` (`models/CanonicalJob.model.ts:21`):

```ts
  descriptionHashChanges?: number;
```

- [ ] **Step 4: Mirror it in shared-types** — in `ICanonicalJob` (`packages/shared-types/src/index.ts`, near `lastSeenAt: Date;` at `:372`):

```ts
  descriptionHashChanges?: number;
```

- [ ] **Step 5: Write the drift through on re-sighting** — replace the duplicate branch in `apps/server/src/services/ingestion.service.ts` (`:163-172`) with:

```ts
if (duplicate) {
  // 6. Re-activate / update existing canonical job. Text is refreshed on
  // re-sighting: without this the stored body freezes at first sight, so
  // content drift is invisible and salary can never corroborate a listing.
  if (duplicate.descriptionHash !== descriptionHash) {
    duplicate.description = description;
    duplicate.descriptionHash = descriptionHash;
    duplicate.descriptionHashChanges =
      (duplicate.descriptionHashChanges ?? 0) + 1;
  }
  duplicate.lastSeenAt = new Date();
  duplicate.isActive = true;
  if (input.rawHtmlSnapshot) {
    duplicate.rawHtmlSnapshot = input.rawHtmlSnapshot;
  }
  await duplicate.save();
  return duplicate;
}
```

- [ ] **Step 6: Run the test and verify it passes**

Run: `cd apps/server && npx vitest run --no-file-parallelism src/tests/ingestion-connector.test.ts src/tests/search-engine.test.ts`
Expected: PASS. `search-engine.test.ts` is the file that already exercises the ingestion pipeline and `cleanupStaleJobs`, so it is the regression net here.

- [ ] **Step 7: Guard the existing dedupe contract** — `ingestion-connector.test.ts` already asserts two polls of one URL collapse to one row; confirm it still passes unchanged (it did before this change and must after).

- [ ] **Step 8: Commit**

```bash
npx prettier --write apps/server/src packages/shared-types/src
git add apps/server/src/services/ingestion.service.ts apps/server/src/models/CanonicalJob.model.ts packages/shared-types/src/index.ts apps/server/src/tests/ingestion-connector.test.ts
git commit -m "fix(server): refresh job text on re-sighting and count description drift

Stored description was frozen at first sight, so content drift was
undetectable and the ghost-risk signal in #16 could not be built.
Adds descriptionHashChanges on CanonicalJob and shared-types."
```

---

### Task 2: Measure the index before choosing weights

**Files:**

- Create: `apps/server/src/scripts/ghost-baseline.ts`
- Create: `apps/server/src/scripts/seed-and-poll.ts` (dev helper — `data/seed-companies.json` had no consumer; this registers it and polls through the real pipeline)
- Modify: this plan (output recorded in the **Baseline Measurement** section below)

**Interfaces:**

- Consumes: `CanonicalJob` collection in a real or seeded Mongo; `SourceRegistry` + `pollDueSources()`.
- Produces: recorded numbers that justify (or revise) the Task 4 thresholds and weights. **Task 4 may not be merged until this task's output is in this file.**

- [x] **Step 1: Write the scripts** — both committed. The baseline script buckets two age signals: `firstSeenAt` span (which is all `<7` days on a fresh index — useless at first sighting) **and** `postedDate` age, which the providers actually supply (`Greenhouse first_published`, `Lever createdAt`, `Ashby publishedAt`, `RemoteOK published_at`) and which carries the true listing age. The design must calibrate against `postedDate`, not `firstSeenAt`. Run with: `MONGODB_URI=... npx tsx src/scripts/ghost-baseline.ts` from `apps/server`.

- [x] **Step 2: Run it against the seeded index**

Run: `docker compose up -d mongodb` (local compose), then `MONGODB_URI=mongodb://jobtailor:…@127.0.0.1:27017/jobtailor?authSource=admin npx tsx src/scripts/seed-and-poll.ts` (registers 23 sources from `data/seed-companies.json`, polls the live APIs once), then the baseline script.
Expected: one JSON object printed. No DB writes by the baseline itself.

- [x] **Step 3: Sanity-check against the evidence base** — 1,235 active listings ingested (RemoteOK alone contributes 99, all passing the fixed employment-type boundary). Provider `postedDate` shows 555 of 1,235 listings (45 %) older than 60 days and 269 (22 %) older than 120 — consistent with the Datadog evergreen roles first published in 2025 that were sampled in the evidence table.

- [x] **Step 4: Recorded in the Baseline Measurement section below.** The `>60`-day share is ~45 %, far above the 5 % re-rank threshold: proceed with the scorer.

- [x] **Step 5: Commit**

```bash
git add apps/server/src/scripts/ghost-baseline.ts apps/server/src/scripts/seed-and-poll.ts docs/superpowers/plans/2026-09-30-ghost-listing-detection.md
git commit -m "chore(server): add ghost-listing baseline measurement script

TODO_PLAN #16 requires measured signal prevalence before weights are
picked; the recorded output lives in the plan document."
```

## Baseline Measurement (2026-09-30)

Run against a local compose Mongo seeded with `seed-and-poll.ts` (23 registered sources: the 23 companies in `data/seed-companies.json`; polled live once; `POST`-style poll through the real `pollDueSources()` path, no HTTP mock):

```json
{
  "activeListings": 1235,
  "firstSightingAgeDaysBuckets": {
    "<7": 1235,
    "7-30": 0,
    "30-60": 0,
    "60-120": 0,
    ">120": 0
  },
  "postedDateAgeDaysBuckets": {
    "<7": 185,
    "7-30": 260,
    "30-60": 235,
    "60-120": 286,
    ">120": 269
  },
  "repostGroups": { "dup2": 0, "dup3plus": 0 },
  "evergreenHits": 18,
  "noContentChangeEver": 1208
}
```

**What this decides:**

1. **Span signal: use `postedDate` as the anchor** (`postedDate ?? firstSeenAt`). `firstSeenAt` is first-sighting time, which on any fresh index is "today" for everything; the 45 % `>60`-day share proves the listing-age problem is real and calibrates the Task 4 span threshold of 60 days (45 for contract/internship) — it sits near the distribution's centre, not at an edge.
2. **Repost churn: zero today.** One poll produces no same-role duplicates (dedup collapses them). The signal only accrues as listings lapse and return. Keep the weight, but accept it contributes nothing on day one — it is an accruing signal, not a day-one one.
3. **`descriptionHashChanges`: zero-information today** — every row was first seen in this run, so `noContentChangeEver = 1208` is an artifact, not a finding. Task 1's drift counting is what makes the "unchanged text" signal honest from the second poll onward. Until re-sightings accumulate, the unchanged sub-signal must not fire merely because the counter is 0: the scorer requires `spanDays >= threshold` first, which is exactly what Task 4 implements.
4. **Evergreen copy: 18 hits (~1.5 %)** — small but non-zero; worth 0.15 weight as specified.
5. **Honest scope note:** of the 23 seeded sources, 16 polled clean and 7 failed at the board level with HTTP 404 — stale board tokens in `data/seed-companies.json` (elasticco, hashicorp, plaid, sentiance, netflix, framer, loops). Per-posting ingest failures (`description is required` after the HTML strip) are visible in the poll log and counted in each poll's `failed` field — loud, not silent. Neither class affects the age distribution above.

---

### Task 3: Persist the ghost fields

**Files:**

- Modify: `apps/server/src/models/CanonicalJob.model.ts` (schema + interface)
- Modify: `packages/shared-types/src/index.ts` (`ICanonicalJob`)
- Test: `apps/server/src/tests/ghost-fields.test.ts`

**Interfaces:**

- Consumes: existing `CanonicalJob` model, `connectTestDb` helper.
- Produces: `ghostRisk?: number`, `ghostReasons?: string[]`, `ghostEvaluatedAt?: Date`, `userGhostVerdict?: "real" | "ghost"` — consumed by Tasks 4–8.

- [ ] **Step 1: Write the failing test** — `apps/server/src/tests/ghost-fields.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { CanonicalJob } from "../models/CanonicalJob.model.js";
import { connectTestDb, disconnectTestDb } from "./helpers/test-db.js";

process.env.NODE_ENV = "test";

describe("CanonicalJob ghost fields", () => {
  beforeAll(async () => {
    await connectTestDb();
  });
  afterAll(async () => {
    await disconnectTestDb();
  });
  beforeEach(async () => {
    await CanonicalJob.deleteMany({});
  });

  it("persists and re-reads every ghost field (strict mode guard)", async () => {
    const created = await CanonicalJob.create({
      sourceName: "Acme (Greenhouse)",
      companyName: "Acme",
      jobTitle: "Engineer",
      location: "Remote",
      workType: "remote",
      description: "Body text",
      dedupeKey: "acme_engineer_remote",
      ghostRisk: 0.55,
      ghostReasons: ["listed for 90 days", "unchanged text"],
      ghostEvaluatedAt: new Date("2026-09-30T00:00:00.000Z"),
      userGhostVerdict: "real",
    });

    const reread = await CanonicalJob.findById(created._id).lean();
    expect(reread?.ghostRisk).toBe(0.55);
    expect(reread?.ghostReasons).toEqual([
      "listed for 90 days",
      "unchanged text",
    ]);
    expect(reread?.ghostEvaluatedAt).toBeInstanceOf(Date);
    expect(reread?.userGhostVerdict).toBe("real");
  });

  it("rejects an unknown userGhostVerdict", async () => {
    await expect(
      CanonicalJob.create({
        sourceName: "Acme (Greenhouse)",
        companyName: "B",
        jobTitle: "X",
        location: "Remote",
        workType: "remote",
        description: "Body",
        dedupeKey: "b_x_remote",
        userGhostVerdict: "maybe",
      }),
    ).rejects.toThrow(/userGhostVerdict/);
  });
});
```

- [ ] **Step 2: Run it and verify both tests fail**

Run: `cd apps/server && npx vitest run src/tests/ghost-fields.test.ts`
Expected: FAIL — first on `expected undefined to be 0.55` (paths stripped), second on "expected promise not to reject".

- [ ] **Step 3: Declare the paths** in `apps/server/src/models/CanonicalJob.model.ts`, after `verificationError: String,` (`:98`):

```ts
    ghostRisk: { type: Number, min: 0, max: 1 },
    ghostReasons: [{ type: String }],
    ghostEvaluatedAt: Date,
    userGhostVerdict: {
      type: String,
      enum: ['real', 'ghost'],
    },
```

and on `ICanonicalJobDocument` (next to `expiredAt`, `:24`):

```ts
  ghostRisk?: number;
  ghostReasons?: string[];
  ghostEvaluatedAt?: Date;
  userGhostVerdict?: 'real' | 'ghost';
```

- [ ] **Step 4: Mirror on shared-types `ICanonicalJob`** (`packages/shared-types/src/index.ts`, after `verificationState` at `:375`):

```ts
  ghostRisk?: number;
  ghostReasons?: string[];
  ghostEvaluatedAt?: Date;
  userGhostVerdict?: "real" | "ghost";
```

- [ ] **Step 5: Add the read index the sweep needs** — with the other index declarations (`:106-107`):

```ts
canonicalJobSchema.index({ isActive: 1, ghostEvaluatedAt: 1 });
```

- [ ] **Step 6: Run the test and verify it passes**

Run: `cd apps/server && npx vitest run src/tests/ghost-fields.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/models/CanonicalJob.model.ts packages/shared-types/src/index.ts apps/server/src/tests/ghost-fields.test.ts
git commit -m "feat(server): add ghost-risk fields to CanonicalJob

Schema and shared-types carry ghostRisk, ghostReasons, ghostEvaluatedAt
and userGhostVerdict so the advisory verdict survives re-sightings."
```

---

### Task 4: Pure scorer with golden regression cases

**Files:**

- Create: `apps/server/src/services/ghost-job.service.ts`
- Create: `apps/server/src/tests/fixtures/ghost-golden-cases.json`
- Test: `apps/server/src/tests/ghost-job.test.ts`

**Interfaces:**

- Consumes: `GhostJobInput` fields persisted by Tasks 1 and 3.
- Produces:

```ts
export interface GhostJobInput {
  jobTitle: string;
  description?: string;
  location?: string;
  employmentType?: "full-time" | "part-time" | "contract" | "internship";
  firstSeenAt: Date;
  lastSeenAt: Date;
  descriptionHashChanges?: number;
  userGhostVerdict?: "real" | "ghost";
}

export interface GhostContext {
  sameRoleCount: number;
  now: Date;
}

export interface GhostVerdict {
  risk: number;
  reasons: string[];
}

export function scoreGhostSignals(
  job: GhostJobInput,
  ctx: GhostContext,
): GhostVerdict;
```

- [ ] **Step 1: Write the golden fixture** — `apps/server/src/tests/fixtures/ghost-golden-cases.json`. Expected values are hand-computed from the weights in Step 5 (`0.45·span + 0.30·repost + 0.15·evergreen + 0.10·unchanged`, span threshold 60 days, 45 for contract/internship):

```json
{
  "cases": [
    {
      "name": "fresh single sighting",
      "job": {
        "jobTitle": "Backend Engineer",
        "description": "Build APIs.",
        "firstSeenAt": "2026-09-25T00:00:00.000Z",
        "lastSeenAt": "2026-09-30T00:00:00.000Z"
      },
      "sameRoleCount": 1,
      "now": "2026-09-30T00:00:00.000Z",
      "expectedRisk": 0.0375,
      "expectedReasons": []
    },
    {
      "name": "old, unchanged, no churn",
      "job": {
        "jobTitle": "Backend Engineer",
        "description": "Build APIs.",
        "firstSeenAt": "2026-07-02T00:00:00.000Z",
        "lastSeenAt": "2026-09-30T00:00:00.000Z",
        "descriptionHashChanges": 0
      },
      "sameRoleCount": 1,
      "now": "2026-09-30T00:00:00.000Z",
      "expectedRisk": 0.55,
      "expectedReasons": ["listed 90 days", "text unchanged"]
    },
    {
      "name": "reposted three times, evergreen copy",
      "job": {
        "jobTitle": "Software Engineer (always hiring)",
        "description": "We review continuously.",
        "firstSeenAt": "2026-06-01T00:00:00.000Z",
        "lastSeenAt": "2026-09-30T00:00:00.000Z",
        "descriptionHashChanges": 0
      },
      "sameRoleCount": 3,
      "now": "2026-09-30T00:00:00.000Z",
      "expectedRisk": 1,
      "expectedReasons": [
        "listed 121 days",
        "reposted 3 times",
        "evergreen posting copy",
        "text unchanged"
      ]
    },
    {
      "name": "contract role past the shorter threshold",
      "job": {
        "jobTitle": "Data Analyst",
        "description": "Dashboards.",
        "employmentType": "contract",
        "firstSeenAt": "2026-08-11T00:00:00.000Z",
        "lastSeenAt": "2026-09-30T00:00:00.000Z",
        "descriptionHashChanges": 0
      },
      "sameRoleCount": 1,
      "now": "2026-09-30T00:00:00.000Z",
      "expectedRisk": 0.55,
      "expectedReasons": ["listed 50 days", "text unchanged"]
    },
    {
      "name": "text refreshed after going stale",
      "job": {
        "jobTitle": "Backend Engineer",
        "description": "Rewritten body.",
        "firstSeenAt": "2026-07-02T00:00:00.000Z",
        "lastSeenAt": "2026-09-30T00:00:00.000Z",
        "descriptionHashChanges": 2
      },
      "sameRoleCount": 1,
      "now": "2026-09-30T00:00:00.000Z",
      "expectedRisk": 0.45,
      "expectedReasons": ["listed 90 days"]
    },
    {
      "name": "user says still hiring",
      "job": {
        "jobTitle": "Software Engineer (always hiring)",
        "description": "We review continuously.",
        "firstSeenAt": "2026-01-01T00:00:00.000Z",
        "lastSeenAt": "2026-09-30T00:00:00.000Z",
        "descriptionHashChanges": 0,
        "userGhostVerdict": "real"
      },
      "sameRoleCount": 4,
      "now": "2026-09-30T00:00:00.000Z",
      "expectedRisk": 0,
      "expectedReasons": ["you marked this as still hiring"]
    }
  ]
}
```

- [ ] **Step 2: Write the failing test** — `apps/server/src/tests/ghost-job.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { scoreGhostSignals } from "../services/ghost-job.service.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(resolve(here, "fixtures/ghost-golden-cases.json"), "utf8"),
) as {
  cases: Array<{
    name: string;
    job: Record<string, unknown>;
    sameRoleCount: number;
    now: string;
    expectedRisk: number;
    expectedReasons: string[];
  }>;
};

describe("scoreGhostSignals golden cases", () => {
  for (const c of fixture.cases) {
    it(c.name, () => {
      const verdict = scoreGhostSignals(
        {
          ...c.job,
          firstSeenAt: new Date(c.job.firstSeenAt as string),
          lastSeenAt: new Date(c.job.lastSeenAt as string),
        } as never,
        { sameRoleCount: c.sameRoleCount, now: new Date(c.now) },
      );
      expect(verdict.risk).toBeCloseTo(c.expectedRisk, 4);
      expect(verdict.reasons).toEqual(c.expectedReasons);
    });
  }
});
```

- [ ] **Step 3: Run it and verify it fails**

Run: `cd apps/server && npx vitest run src/tests/ghost-job.test.ts`
Expected: FAIL — `Cannot find module '../services/ghost-job.service.js'` (or, once the file exists with a stub, six assertion failures).

- [ ] **Step 4: Implement the scorer** — `apps/server/src/services/ghost-job.service.ts`:

```ts
export interface GhostJobInput {
  jobTitle: string;
  description?: string;
  location?: string;
  employmentType?: "full-time" | "part-time" | "contract" | "internship";
  firstSeenAt: Date;
  lastSeenAt: Date;
  descriptionHashChanges?: number;
  userGhostVerdict?: "real" | "ghost";
}

export interface GhostContext {
  sameRoleCount: number;
  now: Date;
}

export interface GhostVerdict {
  risk: number;
  reasons: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SPAN_THRESHOLD_DAYS = 60;
const SHORT_SPAN_THRESHOLD_DAYS = 45;

const WEIGHTS = {
  span: 0.45,
  repost: 0.3,
  evergreen: 0.15,
  unchanged: 0.1,
};

const EVERGREEN =
  /always hiring|ongoing pipeline|rolling|we review continuously|year[- ]round/i;

/**
 * Advisory staleness estimate. Deterministic, computed from stored fields
 * only: no fetches and no LLM, so the poll-time cost invariant holds.
 * It cannot prove a listing is fake - see TODO_PLAN #16 honest limits.
 */
export function scoreGhostSignals(
  job: GhostJobInput,
  ctx: GhostContext,
): GhostVerdict {
  if (job.userGhostVerdict === "real") {
    return { risk: 0, reasons: ["you marked this as still hiring"] };
  }

  const reasons: string[] = [];
  const threshold =
    job.employmentType === "contract" || job.employmentType === "internship"
      ? SHORT_SPAN_THRESHOLD_DAYS
      : SPAN_THRESHOLD_DAYS;

  const spanDays = Math.max(
    0,
    (ctx.now.getTime() - new Date(job.firstSeenAt).getTime()) / DAY_MS,
  );
  const span = Math.min(1, spanDays / threshold);

  const repost = ctx.sameRoleCount >= 3 ? 1 : ctx.sameRoleCount === 2 ? 0.5 : 0;

  const evergreenHit = EVERGREEN.test(
    `${job.jobTitle} ${job.description ?? ""}`,
  );

  const unchanged =
    spanDays >= threshold && (job.descriptionHashChanges ?? 0) === 0;

  if (spanDays >= threshold) {
    reasons.push(`listed ${Math.round(spanDays)} days`);
  }
  if (ctx.sameRoleCount >= 2) {
    reasons.push(`reposted ${ctx.sameRoleCount} times`);
  }
  if (evergreenHit) {
    reasons.push("evergreen posting copy");
  }
  if (unchanged) {
    reasons.push("text unchanged");
  }

  const raw =
    WEIGHTS.span * span +
    WEIGHTS.repost * repost +
    WEIGHTS.evergreen * (evergreenHit ? 1 : 0) +
    WEIGHTS.unchanged * (unchanged ? 1 : 0);

  return {
    risk: Math.min(1, Math.max(0, Number(raw.toFixed(4)))),
    reasons,
  };
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `cd apps/server && npx vitest run src/tests/ghost-job.test.ts`
Expected: PASS (6 tests). If a case fails on `reasons` order, reorder the pushes — do not loosen the assertion to `toContain`.

- [ ] **Step 6: Prove the golden file is load-bearing** — change `WEIGHTS.span` to `0.5`, re-run, confirm at least two cases fail, then restore `0.45`. A golden suite that passes under any weights is not a regression guard.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/services/ghost-job.service.ts apps/server/src/tests/ghost-job.test.ts apps/server/src/tests/fixtures/ghost-golden-cases.json
git commit -m "feat(server): add deterministic ghost-listing signal scorer

scoreGhostSignals() is pure and golden-tested against hand-computed
risk values; reasons are surfaced verbatim in the UI."
```

---

### Task 5: Drive the scorer from the daily sweep

**Files:**

- Modify: `apps/server/src/services/ghost-job.service.ts` (add `applyGhostScoring`)
- Modify: `apps/server/src/jobs/stale-cleanup.job.ts` (`runStaleCleanup`)
- Test: `apps/server/src/tests/ghost-sweep.test.ts`

**Interfaces:**

- Consumes: `scoreGhostSignals()` (Task 4), `CanonicalJob` fields (Task 3), `runStaleCleanup()` (`jobs/stale-cleanup.job.ts:17-38`).
- Produces: `applyGhostScoring(): Promise<{ evaluated: number }>` — persists `ghostRisk`, `ghostReasons`, `ghostEvaluatedAt`.

- [ ] **Step 1: Write the failing test** — `apps/server/src/tests/ghost-sweep.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { CanonicalJob } from "../models/CanonicalJob.model.js";
import { applyGhostScoring } from "../services/ghost-job.service.js";
import { connectTestDb, disconnectTestDb } from "./helpers/test-db.js";

process.env.NODE_ENV = "test";

const DAY = 24 * 60 * 60 * 1000;
const seed = (over: Record<string, unknown>) =>
  CanonicalJob.create({
    sourceName: "Acme (Greenhouse)",
    companyName: "Acme",
    jobTitle: "Engineer",
    location: "Remote",
    workType: "remote",
    description: "Build things.",
    isActive: true,
    verificationState: "verified",
    firstSeenAt: new Date(Date.now() - 5 * DAY),
    lastSeenAt: new Date(),
    dedupeKey: `acme_engineer_${Math.random().toString(36).slice(2)}`,
    ...over,
  });

describe("applyGhostScoring", () => {
  beforeAll(async () => {
    await connectTestDb();
  });
  afterAll(async () => {
    await disconnectTestDb();
  });
  beforeEach(async () => {
    await CanonicalJob.deleteMany({});
  });

  it("scores stale listings and leaves fresh ones near zero", async () => {
    const stale = await seed({ firstSeenAt: new Date(Date.now() - 120 * DAY) });
    const fresh = await seed({
      jobTitle: "Fresh Eng",
      firstSeenAt: new Date(Date.now() - 2 * DAY),
    });

    const { evaluated } = await applyGhostScoring();
    expect(evaluated).toBe(2);

    const s = await CanonicalJob.findById(stale._id).lean();
    const f = await CanonicalJob.findById(fresh._id).lean();
    expect(s?.ghostRisk ?? 0).toBeGreaterThan(0.5);
    expect(s?.ghostReasons).toContain("listed 120 days");
    expect(s?.ghostEvaluatedAt).toBeInstanceOf(Date);
    expect(f?.ghostRisk ?? 0).toBeLessThan(0.1);
  });

  it("never deactivates or changes verificationState", async () => {
    const stale = await seed({ firstSeenAt: new Date(Date.now() - 200 * DAY) });
    await applyGhostScoring();
    const after = await CanonicalJob.findById(stale._id).lean();
    expect(after?.isActive).toBe(true);
    expect(after?.verificationState).toBe("verified");
  });

  it("counts repost churn for the same company/title/location", async () => {
    for (let i = 0; i < 3; i++) {
      await seed({
        jobTitle: "Reposted Eng",
        firstSeenAt: new Date(Date.now() - 120 * DAY),
      });
    }
    await applyGhostScoring();
    const rows = await CanonicalJob.find({ jobTitle: "Reposted Eng" }).lean();
    expect(rows[0]?.ghostReasons).toContain("reposted 3 times");
  });

  it("respects a user verdict", async () => {
    const pinned = await seed({
      firstSeenAt: new Date(Date.now() - 300 * DAY),
      userGhostVerdict: "real",
    });
    await applyGhostScoring();
    const after = await CanonicalJob.findById(pinned._id).lean();
    expect(after?.ghostRisk).toBe(0);
    expect(after?.ghostReasons).toEqual(["you marked this as still hiring"]);
  });

  it("skips inactive listings", async () => {
    await seed({ isActive: false });
    const { evaluated } = await applyGhostScoring();
    expect(evaluated).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `cd apps/server && npx vitest run src/tests/ghost-sweep.test.ts`
Expected: FAIL — `applyGhostScoring is not a function` / missing export.

- [ ] **Step 3: Implement the sweep step** — append to `apps/server/src/services/ghost-job.service.ts`:

```ts
import { CanonicalJob } from "../models/CanonicalJob.model.js";

/**
 * Score every live listing in one pass. Reads only what is already stored,
 * so cost is one indexed scan plus one aggregation per run. Called from the
 * daily stale-cleanup sweep after the link check, never from a request.
 */
export async function applyGhostScoring(): Promise<{ evaluated: number }> {
  const jobs = await CanonicalJob.find({ isActive: true }).select(
    "companyName jobTitle location employmentType firstSeenAt lastSeenAt descriptionHashChanges userGhostVerdict description",
  );

  const grouped = await CanonicalJob.aggregate<{
    _id: { c: string; t: string; l: string };
    n: number;
  }>([
    { $match: { isActive: true } },
    {
      $group: {
        _id: { c: "$companyName", t: "$jobTitle", l: "$location" },
        n: { $sum: 1 },
      },
    },
  ]);
  const counts = new Map<string, number>();
  for (const row of grouped) {
    counts.set(`${row._id.c}|${row._id.t}|${row._id.l}`, row.n);
  }

  const now = new Date();
  let evaluated = 0;
  for (const job of jobs) {
    const verdict = scoreGhostSignals(job, {
      sameRoleCount:
        counts.get(`${job.companyName}|${job.jobTitle}|${job.location}`) ?? 1,
      now,
    });
    if (
      job.ghostRisk === verdict.risk &&
      job.ghostEvaluatedAt &&
      now.getTime() - job.ghostEvaluatedAt.getTime() < 6 * 60 * 60 * 1000
    ) {
      continue; // already scored this cycle with the same answer
    }
    job.ghostRisk = verdict.risk;
    job.ghostReasons = verdict.reasons;
    job.ghostEvaluatedAt = now;
    await job.save();
    evaluated++;
  }

  return { evaluated };
}
```

- [ ] **Step 4: Wire it into the cron run** — in `apps/server/src/jobs/stale-cleanup.job.ts`, import it and extend the try block of `runStaleCleanup` so ghost scoring happens **after** the link check:

```ts
import { applyGhostScoring } from "../services/ghost-job.service.js";
```

```ts
const started = Date.now();
const deactivated = await CleanupService.cleanupStaleJobs(thresholdDays);
const { evaluated } = await applyGhostScoring();
console.log(
  `✅ StaleCleanup: deactivated ${deactivated} jobs, ghost-scored ${evaluated} in ${((Date.now() - started) / 1000).toFixed(1)}s`,
);
return deactivated;
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `cd apps/server && npx vitest run --no-file-parallelism src/tests/ghost-sweep.test.ts src/tests/search-engine.test.ts src/tests/live-job-discovery.e2e.test.ts`
Expected: PASS. `search-engine.test.ts` is where `cleanupStaleJobs` is currently covered, so it proves the new sweep step did not disturb the existing cutoff behaviour.

- [ ] **Step 6: Confirm the sweep still cannot hide a job** — the "never deactivates" test is the contract; keep it even if later tasks add filters.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/services/ghost-job.service.ts apps/server/src/jobs/stale-cleanup.job.ts apps/server/src/tests/ghost-sweep.test.ts
git commit -m "feat(server): ghost-score live listings during the daily sweep

Runs after the link check so only live-and-old listings are scored;
the pass never changes isActive or verificationState."
```

---

### Task 6: Demote in ranking, filter only on explicit opt-in

**Files:**

- Modify: `apps/server/src/services/search.service.ts:211-215` (after the trust boost), `:16-28` (params), `:45-48` (query)
- Modify: `apps/server/src/services/feed.service.ts` (same demotion)
- Modify: `apps/server/src/routes/search.routes.ts` (`searchJobsQuerySchema`)
- Test: `apps/server/src/tests/ghost-ranking.test.ts`

**Interfaces:**

- Consumes: `ghostRisk` persisted by Task 5.
- Produces: `ISearchParams.hideGhosts?: boolean` and demoted `relevanceScore`.

- [ ] **Step 1: Write the failing test** — `apps/server/src/tests/ghost-ranking.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { CanonicalJob } from "../models/CanonicalJob.model.js";
import { SearchService } from "../services/search.service.js";
import { connectTestDb, disconnectTestDb } from "./helpers/test-db.js";

process.env.NODE_ENV = "test";

describe("ghost demotion in search ranking", () => {
  beforeAll(async () => {
    await connectTestDb();
  });
  afterAll(async () => {
    await disconnectTestDb();
  });
  beforeEach(async () => {
    await CanonicalJob.deleteMany({});
    const base = {
      sourceName: "Acme (Greenhouse)",
      companyName: "Acme",
      workType: "remote",
      location: "Remote",
      description: "React engineer role with TypeScript.",
      isActive: true,
      verificationState: "unverified",
    };
    await CanonicalJob.create({
      ...base,
      jobTitle: "React Engineer",
      dedupeKey: "clean",
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      ghostRisk: 0,
    });
    await CanonicalJob.create({
      ...base,
      jobTitle: "React Engineer Ghost",
      dedupeKey: "ghosty",
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      ghostRisk: 0.9,
    });
  });

  it("keeps a high-risk listing reachable but ranked below the clean one", async () => {
    const res = await SearchService.searchJobs({ q: "React Engineer" });
    const titles = res.jobs.map((j: { jobTitle: string }) => j.jobTitle);
    expect(titles).toContain("React Engineer Ghost");
    expect(titles.indexOf("React Engineer")).toBeLessThan(
      titles.indexOf("React Engineer Ghost"),
    );
  });

  it("drops it only when the user opts in", async () => {
    const res = await SearchService.searchJobs({
      q: "React Engineer",
      hideGhosts: true,
    });
    const titles = res.jobs.map((j: { jobTitle: string }) => j.jobTitle);
    expect(titles).not.toContain("React Engineer Ghost");
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `cd apps/server && npx vitest run src/tests/ghost-ranking.test.ts`
Expected: FAIL — both assertions, because no demotion or filter exists yet (order is a tie, and `hideGhosts` is ignored).

- [ ] **Step 3: Apply the demotion** — in `apps/server/src/services/search.service.ts`, immediately after the source-trust boost block (`:211-215`) and before the `return { ...job, relevanceScore: score }`:

```ts
// 7. Ghost demotion — advisory only, never an exclusion. A 0.9-risk
// listing loses 45% of its relevance but stays searchable.
const ghostRisk = typeof job.ghostRisk === "number" ? job.ghostRisk : 0;
if (ghostRisk > 0) {
  score *= 1 - 0.5 * ghostRisk;
}
```

Mirror the same two lines in `apps/server/src/services/feed.service.ts` where feed candidates are scored, so the digest (#6) inherits the behaviour rather than re-deriving it.

- [ ] **Step 4: Accept the parameter** — `searchJobsQuerySchema` starts at `apps/server/src/routes/search.routes.ts:60`; add the field after its last entry, `salaryMin` (`:70`). `ISearchParams` is declared at `apps/server/src/services/search.service.ts:16`:

```ts
  hideGhosts: z.coerce.boolean().optional(),
```

```ts
  hideGhosts?: boolean;
```

- [ ] **Step 5: Add the opt-in filter** — declare the threshold next to the other module constants in `search.service.ts`, then destructure the param and extend the query builder:

```ts
const GHOST_HIDE_THRESHOLD = 0.6;
```

```ts
const hideGhosts = params.hideGhosts === true;
```

```ts
if (hideGhosts) {
  // Opt-in only, and untagged rows survive: a listing nobody has measured
  // yet is not a ghost.
  query.$and = [
    ...(query.$and ?? []),
    [
      {
        $or: [
          { ghostRisk: { $exists: false } },
          { ghostRisk: null },
          { ghostRisk: { $lt: GHOST_HIDE_THRESHOLD } },
        ],
      },
    ],
  ];
}
```

- [ ] **Step 6: Run the test and verify it passes**

Run: `cd apps/server && npx vitest run --no-file-parallelism src/tests/ghost-ranking.test.ts src/tests/search-engine.test.ts`
Expected: PASS. If `search-engine.test.ts` ordering assertions shift, confirm no seeded fixture in it carries `ghostRisk` — existing rows have the field unset, so scores must be unchanged.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/services/search.service.ts apps/server/src/services/feed.service.ts apps/server/src/routes/search.routes.ts apps/server/src/tests/ghost-ranking.test.ts
git commit -m "feat(server): demote likely ghost listings in search and feed ranking

Ranking-only multiplier (1 - 0.5 * ghostRisk); hiding requires the
explicit hideGhosts opt-in and never applies to untagged listings."
```

---

### Task 7: "Still hiring" override through the feedback endpoint

**Files:**

- Modify: `apps/server/src/routes/search.routes.ts:137-141`
- Modify: `apps/server/src/controllers/analytics.controller.ts:386-393`
- Modify: `apps/server/src/models/JobInteractionLog.model.ts:6`, `:27`
- Modify: `apps/server/src/services/analytics.service.ts:33+`
- Test: `apps/server/src/tests/ghost-feedback.test.ts`

**Interfaces:**

- Consumes: `POST /api/v1/search/feedback`, `scoreGhostSignals()` verdict rule.
- Produces: `interactionType: "still_hiring"` writing `userGhostVerdict: "real"`; the scorer then returns risk 0 for that row (Task 4 case 6).

- [ ] **Step 1: Write the failing test** — `apps/server/src/tests/ghost-feedback.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { CanonicalJob } from "../models/CanonicalJob.model.js";
import { JobInteractionLog } from "../models/JobInteractionLog.model.js";
import { AnalyticsService } from "../services/analytics.service.js";
import { connectTestDb, disconnectTestDb } from "./helpers/test-db.js";

process.env.NODE_ENV = "test";

describe("still_hiring feedback", () => {
  const userId = new mongoose.Types.ObjectId().toString();

  beforeAll(async () => {
    await connectTestDb();
  });
  afterAll(async () => {
    await disconnectTestDb();
  });
  beforeEach(async () => {
    await CanonicalJob.deleteMany({});
    await JobInteractionLog.deleteMany({});
  });

  it("pins the verdict and clears the risk", async () => {
    const job = await CanonicalJob.create({
      sourceName: "Acme (Greenhouse)",
      companyName: "Acme",
      jobTitle: "Engineer",
      location: "Remote",
      workType: "remote",
      description: "Body",
      dedupeKey: "acme_engineer_remote",
      firstSeenAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
      lastSeenAt: new Date(),
      ghostRisk: 0.95,
      ghostReasons: ["listed 400 days"],
    });

    // Verified signature (services/analytics.service.ts:36-40):
    // logInteraction(userId, canonicalJobId, interactionType, feedbackComment?)
    await AnalyticsService.logInteraction(
      userId,
      String(job._id),
      "still_hiring",
    );

    const after = await CanonicalJob.findById(job._id).lean();
    expect(after?.userGhostVerdict).toBe("real");
    expect(after?.ghostRisk).toBe(0);
    expect(after?.ghostReasons).toEqual(["you marked this as still hiring"]);
    expect(after?.isActive).toBe(true);

    const logs = await JobInteractionLog.find({ canonicalJobId: job._id });
    expect(logs.map((l) => l.interactionType)).toContain("still_hiring");
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `cd apps/server && npx vitest run src/tests/ghost-feedback.test.ts`
Expected: FAIL — Mongoose throws `Value "still_hiring" does not match enum` on `JobInteractionLog.create`, so the assertion on `userGhostVerdict` is never reached.

- [ ] **Step 3: Extend every layer of the enum** — five sites carry this value; miss any one and the request 400s, the log write is rejected, or the typecheck breaks:

`routes/search.routes.ts:139`:

```ts
  interactionType: z.enum(["flag_expired", "flag_spam", "still_hiring"]),
```

`controllers/analytics.controller.ts:386`:

```ts
    if (
      !["flag_expired", "flag_spam", "still_hiring"].includes(interactionType)
    ) {
```

`models/JobInteractionLog.model.ts:6` (interface) and `:27` (schema enum):

```ts
  interactionType:
    | 'click'
    | 'import'
    | 'flag_expired'
    | 'flag_spam'
    | 'dismiss'
    | 'still_hiring';
```

```ts
      enum: ['click', 'import', 'flag_expired', 'flag_spam', 'dismiss', 'still_hiring'],
```

`services/analytics.service.ts:38` (the parameter union on `logInteraction`):

```ts
    interactionType:
      | 'click'
      | 'import'
      | 'flag_expired'
      | 'flag_spam'
      | 'dismiss'
      | 'still_hiring',
```

- [ ] **Step 4: Persist the verdict** — inside `AnalyticsService.logInteraction`, after the existing `flag_expired` / `flag_spam` handling and using the already-parsed `jobIdObj` (`services/analytics.service.ts:44`):

```ts
if (interactionType === "still_hiring") {
  // Deliberately narrower than flag_expired, which sets isActive=false:
  // a user dispute pins the verdict, it never hides or resurrects a row.
  await CanonicalJob.findByIdAndUpdate(jobIdObj, {
    $set: {
      userGhostVerdict: "real",
      ghostRisk: 0,
      ghostReasons: ["you marked this as still hiring"],
      ghostEvaluatedAt: new Date(),
    },
  });
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `cd apps/server && npx vitest run --no-file-parallelism src/tests/ghost-feedback.test.ts src/tests/analytics.test.ts`
Expected: PASS. Note that a later sweep (Task 5) re-scores the row but the scorer's `userGhostVerdict === "real"` branch returns 0, so the pin survives re-evaluation — that is the whole point of the override and must stay asserted.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/search.routes.ts apps/server/src/controllers/analytics.controller.ts apps/server/src/models/JobInteractionLog.model.ts apps/server/src/services/analytics.service.ts apps/server/src/tests/ghost-feedback.test.ts
git commit -m "feat(server): add still_hiring feedback that pins the ghost verdict

The user's verdict wins over the estimate: risk is cleared and the
scorer honours it on every later sweep."
```

---

### Task 8: Surface the tag, the reasons, and the toggle

**Files:**

- Create: `apps/client/src/components/GhostChip.tsx`
- Modify: `apps/client/src/pages/JobsPage.tsx` (result card + filter bar)
- Modify: `apps/client/src/pages/QualityDashboardPage.tsx` (per-source ghost counts)
- Modify: `apps/client/src/api.ts` / `queryKeys.ts` (pass `hideGhosts`)
- Test: `apps/client/src/tests/ghost-chip.test.tsx`

**Interfaces:**

- Consumes: `ICanonicalJob.ghostRisk` / `ghostReasons` / `userGhostVerdict` (Task 3) and the `hideGhosts` query param (Task 6).
- Produces: `<GhostChip risk reasons verdict />`, and a `still_hiring` POST to `/api/v1/search/feedback` (Task 7).

- [ ] **Step 1: Write the failing test** — `apps/client/src/tests/ghost-chip.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GhostChip } from "../components/GhostChip.js";

describe("GhostChip", () => {
  it("shows the age reason and nothing invented", () => {
    render(
      <GhostChip
        risk={0.72}
        reasons={["listed 90 days", "text unchanged"]}
        onStillHiring={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /still hiring/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/open 90 days/i)).toBeInTheDocument();
  });

  it("renders nothing for an untagged or clean listing", () => {
    const { container } = render(
      <GhostChip risk={undefined} reasons={[]} onStillHiring={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("calls back when the user disputes the tag", async () => {
    const onStillHiring = vi.fn();
    render(
      <GhostChip
        risk={0.9}
        reasons={["listed 200 days"]}
        onStillHiring={onStillHiring}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /still hiring/i }),
    );
    expect(onStillHiring).toHaveBeenCalledTimes(1);
  });

  it("says 'you marked this as still hiring' once overridden", () => {
    render(
      <GhostChip
        risk={0}
        reasons={["you marked this as still hiring"]}
        verdict="real"
        onStillHiring={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/you marked this as still hiring/i),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `cd apps/client && npx vitest run src/tests/ghost-chip.test.tsx`
Expected: FAIL — cannot resolve `../components/GhostChip.js`.

- [ ] **Step 3: Implement the component** — `apps/client/src/components/GhostChip.tsx`:

```tsx
interface GhostChipProps {
  risk?: number;
  reasons: string[];
  verdict?: "real" | "ghost";
  onStillHiring: () => void;
}

const GHOST_TAG_THRESHOLD = 0.6;

/**
 * Advisory staleness tag. The copy never claims a listing is fake: the
 * server-side estimator has no ground truth for employer intent.
 */
export function GhostChip({
  risk,
  reasons,
  verdict,
  onStillHiring,
}: GhostChipProps) {
  if (verdict === "real") {
    return (
      <span
        className="text-xs text-emerald-700"
        data-testid="ghost-chip-pinned"
      >
        you marked this as still hiring
      </span>
    );
  }

  if (typeof risk !== "number" || risk < GHOST_TAG_THRESHOLD) {
    return null;
  }

  const ageReason = reasons.find((r) => /listed \d+ days/.test(r));

  return (
    <span className="inline-flex items-center gap-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
      <span title={reasons.join(" · ")}>
        {ageReason
          ? `open ${ageReason.replace("listed ", "")}`
          : "possibly stale"}
      </span>
      <button type="button" className="underline" onClick={onStillHiring}>
        still hiring?
      </button>
    </span>
  );
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd apps/client && npx vitest run src/tests/ghost-chip.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire it into results and the dispute action** — in `apps/client/src/pages/JobsPage.tsx`, inside each result card, after the title/company line:

```tsx
<GhostChip
  risk={job.ghostRisk}
  reasons={job.ghostReasons ?? []}
  verdict={job.userGhostVerdict}
  onStillHiring={() =>
    feedbackMutation.mutate({
      canonicalJobId: String(job._id),
      interactionType: "still_hiring",
    })
  }
/>
```

Add the mutation next to the existing flag handlers (reuse the one that posts `flag_expired`, same endpoint and invalidation):

```tsx
const feedbackMutation = useMutation({
  mutationFn: (body: { canonicalJobId: string; interactionType: string }) =>
    api.post("/search/feedback", body),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["jobs"] }),
});
```

- [ ] **Step 6: Add the filter toggle** — in the `JobsPage` filter bar, a checkbox bound to local state that appends `&hideGhosts=true` to the search query, plus the matching `queryKeys` entry so cached results do not mix the two views. Default off. Label: `Hide likely stale`.

- [ ] **Step 7: Per-source "likely stale" counts** — the dashboard payload is built in `apps/server/src/services/analytics.service.ts:119-141`, where each `sourceHealth` row currently reports only the four `verificationState` buckets. Add a fifth figure inside that same `sources.map` callback, before the `return {`:

```ts
const ghostTagged = await CanonicalJob.countDocuments({
  sourceId: src._id,
  isActive: true,
  ghostRisk: { $gte: 0.6 },
});
```

and in the returned object (`:139-141`):

```ts
            ghostTagged,
```

Cover it in the test that already asserts the dashboard shape (or append to `apps/server/src/tests/ghost-sweep.test.ts`): seed one source with an active `ghostRisk: 0.8` listing and an active `ghostRisk: 0.1` listing, call `AnalyticsService.getAnalyticsDashboard()`, and expect that source's `ghostTagged` to be `1`.

Then render it in the Quality Dashboard tab of `apps/client/src/pages/JobsPage.tsx`. The `sourceHealth` rows are mapped at `:1534`; add one header cell to that table's header row and one body cell per row:

```tsx
<th className="px-2 py-1">Likely stale</th>
```

```tsx
<td className="px-2 py-1">{src.ghostTagged}</td>
```

Place both in the existing `<tr>` groups so column order stays consistent; do not restructure the table, which is already above the `max-lines` warning threshold for this file.

- [ ] **Step 8: Run the client gates**

Run: `cd apps/client && npx vitest run && npm run typecheck`
Expected: PASS, 0 errors.

- [ ] **Step 9: Manual check in the browser** — `npm run dev`, open search results with a seeded index, confirm the chip renders only above 0.6, the reasons tooltip reads as written by the server, and clicking "still hiring?" removes the chip and pins the green line. If the client cannot be run, say so in the report instead of claiming it works.

- [ ] **Step 10: Commit**

```bash
git add apps/client/src/components/GhostChip.tsx apps/client/src/pages/JobsPage.tsx apps/client/src/tests/ghost-chip.test.tsx
git commit -m "feat(client): tag likely stale listings with an override path

Amber chip lists the server's reasons verbatim; the dispute action pins
userGhostVerdict and the hide filter is opt-in only."
```

---

### Task 9: Documentation and verification baseline

**Files:**

- Modify: `docs/api-reference.md`
- Modify: `TODO_PLAN.md`
- Modify: the verification baseline block in `README.md` / `docs/development-guide.md`

- [ ] **Step 1: Update the API reference** — `POST /api/v1/search/feedback` `interactionType` now accepts `flag_expired | flag_spam | still_hiring`; document the response effect (`userGhostVerdict: "real"`, `ghostRisk: 0`). Add `ghostRisk`, `ghostReasons`, `ghostEvaluatedAt`, `userGhostVerdict` to the `CanonicalJob` response shape and `hideGhosts` to `GET /api/v1/search` query params.

- [ ] **Step 2: Fix the stale line references** in `TODO_PLAN.md` #16: `ingestion.service.ts:160-169` → `:163-169`, and `ingestion.service.ts:195` → `:198`.

- [ ] **Step 3: Record the honest-limits wording** wherever the tag is described: the estimate uses sighting span, repost churn, evergreen copy and unchanged text; `application_deadline` is null on every sampled live posting and `updated_at` is board-wide, so neither informs the score. No claim that a listing is fake.

- [ ] **Step 4: Tick the #16 checkboxes** in `TODO_PLAN.md` only for what actually shipped, and add a one-line status with the commit range.

- [ ] **Step 5: Re-measure and rewrite the baseline** — run the full gate and quote its real output:

```bash
npx turbo run typecheck lint test --force --concurrency=1
npx turbo run test:coverage --force --concurrency=1
```

Update the documented totals (currently 231 tests: 200 server / 30 files, 26 extension / 3, 5 client / 2; lint 0 errors / 248 warnings) and the coverage floors section with the fresh figures. Floors may move only with those numbers in hand.

- [ ] **Step 6: Commit**

```bash
git add docs/api-reference.md TODO_PLAN.md README.md docs/development-guide.md
git commit -m "docs: record ghost-listing detection and refresh baseline

Documents the still_hiring verdict, the new CanonicalJob fields, the
honest limits of the estimate, and the freshly measured gate totals."
```

---

## Self-Review Notes

- **Spec coverage:** every TODO_PLAN #16 checkbox maps to a task — measure-before-weighting (2), golden file (4), pure service + sweep wiring (4, 5), fields on model and shared-types (1, 3), no enum widening with a ranking-only demotion (6), user override via the existing feedback enum (7), UI chip + filter + dashboard counts (8), docs and baseline (9). The prerequisite drift fix is Task 1.
- **Deferred, deliberately:** the `expiredAt` interface/schema mismatch found while verifying the strict-mode constraint is a separate defect and is **not** fixed here; it is reported alongside this plan.
- **Cost invariant:** Tasks 1–9 add zero LLM calls and zero new outbound fetches. The sweep does one indexed scan and one aggregation per day.
- **Failure mode to watch:** if Task 2's measurement shows a negligible share of listings older than 60 days, stop and re-rank #16 rather than shipping a tag that fires on almost nothing.
