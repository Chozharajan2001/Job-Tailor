# ATS Scoring Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the ATS keyword phase from naive token-set matching to synonym-aware, graded-credit, corpus-distinctiveness-weighted scoring; add score caching and a non-destructive rescore endpoint — taking the scoring feature from ~60% to ~85% of its design potential without changing the four-phase weight contract.

**Architecture:** The four-phase pipeline (`scoreATS`) and its weights (0.35 keyword / 0.45 semantic / 0.12 completeness / 0.08 format; degraded 0.55/0.25/0.20) are untouched. The keyword phase is extracted into a new `keyword-scorer.ts` that grades each JD skill (exact → synonym → token-subset → none) using the existing shared `skill-matcher.ts` synonym utility, optionally re-weighted by an IDF map computed from the user's `CanonicalJob` corpus (degrades gracefully to plain weights when the corpus is empty). A golden-score regression file pins behavior before and after. An in-memory LRU cache (keyed on a hash of resume content + parsed JD + engine version) serves `quick-ats-check` re-runs, and `POST /resumes/:id/rescore` compares a fresh v2 score against the stored score without overwriting it.

**Tech Stack:** Node 22, TypeScript 5.8 (strict), Express 5, Mongoose 8, Zod 4, Vitest 3, `mongodb-memory-server` (via existing `connectTestDb`/`disconnectTestDb` helpers), crypto (sha256) — **no new runtime dependencies**.

**Spec:** `docs/ats-scoring-technical-design.md` (v1.0, the authoritative description of current behavior — §4.3 keyword phase, §11 storage, §18 future work items this plan implements) and `TODO_PLAN.md` Tier 1 #3. This plan argues from those documents; executors read both.

## Global Constraints

- Weights are **unchanged**: `0.35/0.45/0.12/0.08`, degraded `0.55/0.25/0.20` (design doc §10 rationale stands until calibration data exists).
- **Never fabricate a semantic score** — the degraded/renormalize-and-flag policy (§4.7) is preserved exactly.
- All tests are hermetic: `mongodb-memory-server` for DB, mock ONLY at `aiProviderManager.generateStructuredOutput` (the established provider boundary). No live AI calls, no network.
- No new runtime npm dependencies. No new Mongoose collections (cache is in-memory; IDF is computed on the fly and cached in-process).
- Every task ends with: `npm run typecheck` clean, touched test files green, one conventional commit (commitlint enforces; **body lines ≤ 100 chars**).
- Run server tests from `apps/server` with `npx vitest run <files>` during development; full suite via `npm run test --workspace=job-tailor-server` before the final task.
- Existing tests in `ats-scoring.test.ts` (5 tests) must keep passing unmodified through Task 5 — they are part of the v1 contract that survives the upgrade (fixture math is verified below).

## File Structure

| File                                                                                                                                | Responsibility                                                                                                            | Action                           |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `apps/server/src/services/ats-scoring.service.ts`                                                                                   | Four-phase pipeline; exports `scoreATS`, `ResumeContent`; delegates keyword phase to v2 scorer from Task 5                | Modify (Tasks 1, 5)              |
| `apps/server/src/tests/fixtures/ats-golden-cases.json`                                                                              | Golden regression fixtures: 4 resume×JD cases with pinned phase scores (v1 values + v2 values after Task 5)               | Create (Task 1), update (Task 5) |
| `apps/server/src/tests/ats-golden.test.ts`                                                                                          | Runs every golden case through `scoreATS` (provider mocked to fail → degraded, fully deterministic) and pins phase scores | Create (Task 1), update (Task 5) |
| `apps/server/src/models/Resume.model.ts`                                                                                            | `IATSScore` + `atsSchema`; fix: persist `semanticScoreDegraded`, add `engineVersion`                                      | Modify (Task 2)                  |
| `apps/server/src/services/keyword-scorer.ts`                                                                                        | Keyword phase v2: graded credit (exact/synonym/token-subset), section-spread bonus, optional IDF weighting                | Create (Task 3)                  |
| `apps/server/src/services/skill-idf.service.ts`                                                                                     | Compute per-skill IDF from the newest ≤500 `CanonicalJob` descriptions; 1-hour in-process cache; empty corpus → empty map | Create (Task 4)                  |
| `apps/server/src/services/score-cache.ts`                                                                                           | `ATS_ENGINE_VERSION`, deterministic hash key, LRU+TTL cache of `IATSScore` (degraded results never cached)                | Create (Task 6)                  |
| `apps/server/src/controllers/resume.controller.ts`                                                                                  | Wire cache into `quickATSCheck` only                                                                                      | Modify (Task 6)                  |
| `apps/server/src/controllers/resume-rescore.controller.ts`                                                                          | `POST /resumes/:id/rescore` — fresh score vs stored, never overwrites                                                     | Create (Task 7)                  |
| `apps/server/src/routes/resume.routes.ts`                                                                                           | Mount rescore route                                                                                                       | Modify (Task 7)                  |
| Tests: `keyword-scorer.test.ts`, `skill-idf.test.ts`, `score-cache.test.ts`, `ats-schema-persist.test.ts`, `resume-rescore.test.ts` | One suite per new module + schema persistence                                                                             | Create (Tasks 2–4, 6–7)          |
| Docs: `docs/ats-scoring-technical-design.md`, `docs/api-reference.md`, `MVP_STATUS.md`, `TODO_PLAN.md`, `docs/architecture.md`      | Sync to v2 reality                                                                                                        | Modify (Task 8)                  |

---

### Task 1: Golden-Score Regression File (pin v1 before any change)

**Files:**

- Modify: `apps/server/src/services/ats-scoring.service.ts` (export the `ResumeContent` interface only — no behavior change)
- Create: `apps/server/src/tests/fixtures/ats-golden-cases.json`
- Create: `apps/server/src/tests/ats-golden.test.ts`

**Interfaces:**

- Consumes: `scoreATS(resume: ResumeContent, jd: IParsedJD): Promise<IATSScore>` (existing, unchanged).
- Produces: exported `ResumeContent` type (used by Tasks 3–7); golden fixture schema `{ caseId, title, resume, jd, v1: { keywordMatchScore, sectionCompletenessScore, formatScore, degradedOverallScore }, v2?: { keywordMatchScore, degradedOverallScore } }` consumed by Task 5.

- [ ] **Step 1: Export ResumeContent (type-only, non-breaking)**

In `ats-scoring.service.ts` change:

```typescript
interface ResumeContent {
```

to:

```typescript
export interface ResumeContent {
```

- [ ] **Step 2: Write the golden fixture file**

Create `apps/server/src/tests/fixtures/ats-golden-cases.json`. The `v1` numbers below were hand-computed from the v1 formulas (design doc §4.3/§4.5/§4.6/§4.7); Step 4 verifies them against the real engine — **the v1 engine is the source of truth**: if a value mismatches, recheck the arithmetic against the documented formula, then record the engine's actual value in the JSON and note the correction in the commit body.

```json
[
  {
    "caseId": "A-exact-match",
    "title": "Both required skills exact-matched; preferred unmatched (the ats-scoring.test.ts fixture)",
    "resume": {
      "summary": "Frontend engineer focused on React and performance.",
      "skills": [
        {
          "name": "React",
          "category": "frontend",
          "yearsOfExperience": 3,
          "proficiency": "advanced"
        },
        {
          "name": "Node.js",
          "category": "backend",
          "yearsOfExperience": 2,
          "proficiency": "intermediate"
        }
      ],
      "experience": [
        {
          "company": "Acme",
          "bullets": [
            {
              "text": "Rebuilt the dashboard in React, cutting load time 40%."
            },
            { "text": "Built Node.js APIs serving 1M requests/day." }
          ]
        }
      ],
      "projects": [
        {
          "name": "Portfolio",
          "techStack": ["React"],
          "highlights": ["10k users"]
        }
      ]
    },
    "jd": {
      "summary": "Build our web platform",
      "seniorityLevel": "mid",
      "focusWeights": {
        "frontend": 50,
        "backend": 40,
        "devops": 10,
        "ai": 0,
        "mobile": 0
      },
      "requiredSkills": ["React", "Node.js"],
      "preferredSkills": ["TypeScript"],
      "responsibilities": ["Ship features"],
      "qualifications": ["B.S. CS"],
      "niceToHaves": ["Docker"],
      "tone": "technical"
    },
    "v1": {
      "keywordMatchScore": 80,
      "sectionCompletenessScore": 73,
      "formatScore": 90,
      "degradedOverallScore": 80
    }
  },
  {
    "caseId": "B-synonym-gap",
    "title": "Resume says 'React.js' and 'TS'; JD asks for 'React' and 'TypeScript' — v1 misses TypeScript",
    "resume": {
      "summary": "Built React.js dashboards and TS tooling.",
      "skills": [
        {
          "name": "React.js",
          "category": "frontend",
          "yearsOfExperience": 2,
          "proficiency": "advanced"
        }
      ],
      "experience": [
        {
          "company": "Beta",
          "bullets": [{ "text": "Shipped React.js component library." }]
        }
      ],
      "projects": []
    },
    "jd": {
      "summary": "Frontend platform role",
      "seniorityLevel": "mid",
      "focusWeights": {
        "frontend": 100,
        "backend": 0,
        "devops": 0,
        "ai": 0,
        "mobile": 0
      },
      "requiredSkills": ["React", "TypeScript"],
      "preferredSkills": [],
      "responsibilities": ["Own the frontend"],
      "qualifications": [],
      "niceToHaves": [],
      "tone": "technical"
    },
    "v1": {
      "keywordMatchScore": 50,
      "sectionCompletenessScore": 55,
      "formatScore": 60,
      "degradedOverallScore": 53
    }
  },
  {
    "caseId": "C-multiword-synonym",
    "title": "Resume says 'SRE'; JD asks for 'Site Reliability' — v1 scores zero",
    "resume": {
      "summary": "SRE practices and on-call ownership.",
      "skills": [
        {
          "name": "SRE",
          "category": "devops",
          "yearsOfExperience": 4,
          "proficiency": "advanced"
        }
      ],
      "experience": [
        {
          "company": "Gamma",
          "bullets": [{ "text": "Ran SRE on-call rotation for core services." }]
        }
      ],
      "projects": []
    },
    "jd": {
      "summary": "Reliability engineering role",
      "seniorityLevel": "senior",
      "focusWeights": {
        "frontend": 0,
        "backend": 30,
        "devops": 70,
        "ai": 0,
        "mobile": 0
      },
      "requiredSkills": ["Site Reliability"],
      "preferredSkills": [],
      "responsibilities": ["Own reliability"],
      "qualifications": [],
      "niceToHaves": [],
      "tone": "technical"
    },
    "v1": {
      "keywordMatchScore": 0,
      "sectionCompletenessScore": 55,
      "formatScore": 60,
      "degradedOverallScore": 26
    }
  },
  {
    "caseId": "D-no-skills",
    "title": "JD lists no skills — keyword phase must be 0, not NaN, in both versions",
    "resume": {
      "summary": "Detail-oriented engineer.",
      "skills": [
        {
          "name": "Java",
          "category": "backend",
          "yearsOfExperience": 3,
          "proficiency": "advanced"
        },
        {
          "name": "SQL",
          "category": "backend",
          "yearsOfExperience": 3,
          "proficiency": "advanced"
        }
      ],
      "experience": [],
      "projects": []
    },
    "jd": {
      "summary": "Generic role",
      "seniorityLevel": "entry",
      "focusWeights": {
        "frontend": 0,
        "backend": 100,
        "devops": 0,
        "ai": 0,
        "mobile": 0
      },
      "requiredSkills": [],
      "preferredSkills": [],
      "responsibilities": [],
      "qualifications": [],
      "niceToHaves": [],
      "tone": "neutral"
    },
    "v1": {
      "keywordMatchScore": 0,
      "sectionCompletenessScore": 25,
      "formatScore": 60,
      "degradedOverallScore": 18
    }
  }
]
```

- [ ] **Step 3: Write the golden test (fails only if v1 behavior differs from the file)**

Create `apps/server/src/tests/ats-golden.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { IParsedJD } from "../models/Job.model.js";

// Mock ONLY at the provider boundary. The semantic phase always FAILS here so
// the golden scores exercise the deterministic phases + degraded renormalization
// (0.55/0.25/0.20) — fully reproducible without any AI provider.
vi.mock("../services/ai-provider/provider-manager.js", () => ({
  aiProviderManager: {
    generateStructuredOutput: vi
      .fn()
      .mockRejectedValue(new Error("golden: provider off")),
  },
}));

import {
  scoreATS,
  type ResumeContent,
} from "../services/ats-scoring.service.js";

interface GoldenCase {
  caseId: string;
  title: string;
  resume: ResumeContent;
  jd: IParsedJD;
  v1: {
    keywordMatchScore: number;
    sectionCompletenessScore: number;
    formatScore: number;
    degradedOverallScore: number;
  };
  v2?: { keywordMatchScore: number; degradedOverallScore: number };
}

const here = path.dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(
  readFileSync(path.join(here, "fixtures", "ats-golden-cases.json"), "utf-8"),
) as GoldenCase[];

// Task 5 flips this to "v2" and fills the v2 expectations with recorded deltas.
const ENGINE_UNDER_TEST = "v1" as "v1" | "v2";

describe("ATS golden-score regression (deterministic phases, provider mocked off)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(cases.map((c) => [c.caseId, c] as const))(
    "%s pins keyword/completeness/format/degraded-overall",
    async (_id, c) => {
      const result = await scoreATS(c.resume, c.jd);
      expect(result.semanticScoreDegraded).toBe(true);

      const expected =
        ENGINE_UNDER_TEST === "v1"
          ? {
              keywordMatchScore: c.v1.keywordMatchScore,
              degradedOverallScore: c.v1.degradedOverallScore,
            }
          : {
              keywordMatchScore: c.v2!.keywordMatchScore,
              degradedOverallScore: c.v2!.degradedOverallScore,
            };

      expect(result.keywordMatchScore).toBe(expected.keywordMatchScore);
      expect(result.sectionCompletenessScore).toBe(
        c.v1.sectionCompletenessScore,
      );
      expect(result.formatScore).toBe(c.v1.formatScore);
      expect(result.overallScore).toBe(expected.degradedOverallScore);
    },
  );
});
```

Note: completeness and format phases are NOT changing in this plan, so the test always pins them to the `v1` values; only keyword/degraded-overall switch with `ENGINE_UNDER_TEST`.

- [ ] **Step 4: Run it — all 4 cases must pass against v1**

Run: `cd apps/server && npx vitest run src/tests/ats-golden.test.ts`
Expected: 4 passed. If a pinned value mismatches, the engine is the source of truth for the v1 baseline: recheck your arithmetic against design doc §4.3–§4.7, correct the JSON, and mention the correction in the commit body. Do NOT change engine code in this task.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add apps/server/src/services/ats-scoring.service.ts apps/server/src/tests/fixtures/ats-golden-cases.json apps/server/src/tests/ats-golden.test.ts
git commit -m "test(server): golden-score regression file pinning ATS v1 deterministic phases"
```

---

### Task 2: Schema fix — persist `semanticScoreDegraded`, add `engineVersion`

**Files:**

- Modify: `apps/server/src/models/Resume.model.ts`
- Create: `apps/server/src/tests/ats-schema-persist.test.ts`

**Interfaces:**

- Consumes: `IATSScore`, `Resume` model, `connectTestDb`/`disconnectTestDb` from `./helpers/test-db.js`, `User` model (valid bcrypt hash via `bcrypt.hashSync("pw", 10)` — the User model rejects non-bcrypt `passwordHash`).
- Produces: `IATSScore.engineVersion?: number` (Tasks 5–7 stamp/read it); persisted `semanticScoreDegraded` (latent-bug fix: today Mongoose strict mode strips it on save).

**Context for the executor:** `semanticScoreDegraded` exists in the `IATSScore` TypeScript interface (line ~32 of `Resume.model.ts`) but was never declared in the Mongoose `atsSchema` — so a persisted degraded score silently loses its flag. This task fixes that and adds the engine-version stamp field the rescore endpoint (Task 7) needs to tell v1 scores from v2 scores.

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/tests/ats-schema-persist.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectTestDb, disconnectTestDb } from "./helpers/test-db.js";
import { Resume } from "../models/Resume.model.js";
import { User } from "../models/User.model.js";

process.env.NODE_ENV = "test";

describe("ATS score schema persistence", () => {
  let userId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    await connectTestDb();
    const u = await User.create({
      email: "schema-persist@test.co",
      passwordHash: bcrypt.hashSync("password123", 10),
      firstName: "S",
      lastName: "P",
      emailVerified: true,
    });
    userId = u._id;
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("persists semanticScoreDegraded and engineVersion on atsScore", async () => {
    const created = await Resume.create({
      userId,
      version: 1,
      versionLabel: "v1-test",
      tailoredSummary: "Summary text for schema test.",
      skills: [],
      experience: [],
      projects: [],
      atsScore: {
        overallScore: 53,
        keywordMatchScore: 50,
        semanticMatchScore: 0,
        sectionCompletenessScore: 55,
        formatScore: 60,
        semanticScoreDegraded: true,
        engineVersion: 2,
        breakdown: {
          matchedSkills: [],
          missingSkills: [],
          weakSkills: [],
          actionItems: [],
        },
      },
    });

    const reloaded = await Resume.findById(created._id).lean();
    expect(reloaded?.atsScore?.semanticScoreDegraded).toBe(true);
    expect(reloaded?.atsScore?.engineVersion).toBe(2);
  });
});
```

- [ ] **Step 2: Run it — must FAIL (`semanticScoreDegraded` undefined after reload)**

Run: `cd apps/server && npx vitest run src/tests/ats-schema-persist.test.ts`
Expected: FAIL — `expected undefined to be true` (strict-mode schema strips unknown fields).

- [ ] **Step 3: Fix the schema**

In `apps/server/src/models/Resume.model.ts`:

1. Add to the `IATSScore` interface, directly after the `semanticScoreDegraded` field:

```typescript
  /** Scoring engine version: 1 = token-set keyword phase, 2 = synonym-aware
   *  graded-credit keyword phase (2026-09 upgrade). Absent on scores stored
   *  before the field existed (treat as v1). */
  engineVersion?: number;
```

2. In `atsSchema`, directly after the `formatScore` line, add:

```typescript
    semanticScoreDegraded: { type: Boolean },
    engineVersion: { type: Number },
```

- [ ] **Step 4: Run it — must PASS**

Run: `cd apps/server && npx vitest run src/tests/ats-schema-persist.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add apps/server/src/models/Resume.model.ts apps/server/src/tests/ats-schema-persist.test.ts
git commit -m "fix(server): persist semanticScoreDegraded flag and add atsScore.engineVersion" -m "The degraded flag existed in IATSScore but not in the Mongoose atsSchema, so
strict mode stripped it on every save. Adds engineVersion for v1/v2 score
provenance used by the rescore endpoint."
```

---

### Task 3: Keyword scorer v2 — graded credit + synonyms + section spread

**Files:**

- Create: `apps/server/src/services/keyword-scorer.ts`
- Create: `apps/server/src/tests/keyword-scorer.test.ts`

**Interfaces:**

- Consumes: `ResumeContent` (exported in Task 1), `IParsedJD` (from `../models/Job.model.js`), `escapeRegex` + `getSynonymRegexString` from `../utils/skill-matcher.js` (type-only import of `ResumeContent` from `ats-scoring.service.js` — no runtime cycle).
- Produces (Task 5 consumes):
  - `export type MatchedBy = "exact" | "synonym" | "token-subset" | "none";`
  - `export interface SkillCredit { skill: string; weight: number; credit: number; matchedBy: MatchedBy; sections: number; effectiveWeight: number; }`
  - `export function scoreKeywordsV2(resume: ResumeContent, jd: IParsedJD, idfNorm?: Map<string, number>): { score: number; credits: SkillCredit[] };`

**Frozen scoring rules (no executor discretion):**

1. Resume text is split into 4 section texts: `summary`, `skills` (joined names), `experience` (joined bullet texts), `projects` (joined techStack + highlights). `fullText` = all four joined with spaces, lowercased.
2. Per JD skill (`requiredSkills` weight 2, `preferredSkills` weight 1 — unchanged):
   - **exact (credit 1.0):** bounded regex `(?<!\w)<escapeRegex(skill)>(?!\w)`, case-insensitive, matches `fullText`.
   - **synonym (credit 0.9):** `new RegExp(getSynonymRegexString(skill), "i")` matches `fullText` (exact failed).
   - **token-subset (credit 0.75):** skill has ≥2 tokens with length > 2 and ALL of them appear in the resume token set (same tokenizer as v1: lowercase, strip `[^\w\s+#.-]`, split whitespace, drop tokens ≤ 1 char).
   - **none (credit 0).**
3. **Section spread:** `sections` = how many of the 4 section texts contain the match (bounded-exact OR synonym regex, per section). If `sections >= 2`, credit += 0.1, capped at 1.0.
4. **IDF weighting (optional):** `effectiveWeight = weight * (idfNorm?.get(skill) ?? 1)`.
5. `score = round( Σ(effectiveWeight × credit) / Σ(effectiveWeight) × 100 )`; if `Σ effectiveWeight === 0` → `score = 0`.
6. Pure and synchronous — no DB, no LLM.

- [ ] **Step 1: Write the failing tests**

Create `apps/server/src/tests/keyword-scorer.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { scoreKeywordsV2 } from "../services/keyword-scorer.js";
import type { ResumeContent } from "../services/ats-scoring.service.js";
import type { IParsedJD } from "../models/Job.model.js";

const baseResume: ResumeContent = {
  summary: "Built React.js dashboards and TS tooling.",
  skills: [
    {
      name: "React.js",
      category: "frontend",
      yearsOfExperience: 2,
      proficiency: "advanced",
    },
  ],
  experience: [
    {
      company: "Beta",
      bullets: [{ text: "Shipped React.js component library." }],
    },
  ],
  projects: [],
};

function jd(required: string[], preferred: string[] = []): IParsedJD {
  return {
    summary: "role",
    seniorityLevel: "mid",
    focusWeights: { frontend: 100, backend: 0, devops: 0, ai: 0, mobile: 0 },
    requiredSkills: required,
    preferredSkills: preferred,
    responsibilities: [],
    qualifications: [],
    niceToHaves: [],
    tone: "technical",
  };
}

describe("scoreKeywordsV2", () => {
  it("grades exact matches at 1.0 and keeps required 2x / preferred 1x weights", () => {
    const r = scoreKeywordsV2(baseResume, jd(["React"], ["GraphQL"]));
    // React: bounded-exact hits inside "React.js" ('.' is a non-word boundary) → 1.0.
    // Spread: summary + skills + experience = 3 sections → +0.1 capped at 1.0.
    // GraphQL: none → 0.  (2*1.0)/(2+1) = 66.67 → 67
    expect(r.score).toBe(67);
    expect(r.credits.find((c) => c.skill === "React")?.matchedBy).toBe("exact");
    expect(r.credits.find((c) => c.skill === "GraphQL")?.matchedBy).toBe(
      "none",
    );
  });

  it("grades synonym matches at 0.9 (TS counts for TypeScript)", () => {
    const r = scoreKeywordsV2(baseResume, jd(["TypeScript"]));
    expect(r.credits[0].matchedBy).toBe("synonym");
    expect(r.score).toBe(90); // 0.9 * 100, single skill, one section only
  });

  it("grades multi-word token-subset matches at 0.75", () => {
    const resume: ResumeContent = {
      ...baseResume,
      summary: "Worked with large scale distributed systems.",
      skills: [],
      experience: [
        {
          company: "X",
          bullets: [{ text: "Owned distributed systems reliability." }],
        },
      ],
    };
    const r = scoreKeywordsV2(resume, jd(["Distributed Systems"]));
    expect(r.credits[0].matchedBy).toBe("token-subset");
    // 0.75 + 0.1 spread (summary + experience) = 0.85 → 85
    expect(r.score).toBe(85);
  });

  it("expands synonyms for multi-word groups (SRE ↔ Site Reliability)", () => {
    const resume: ResumeContent = {
      ...baseResume,
      summary: "SRE practices and on-call ownership.",
      skills: [
        {
          name: "SRE",
          category: "devops",
          yearsOfExperience: 4,
          proficiency: "advanced",
        },
      ],
    };
    const r = scoreKeywordsV2(resume, jd(["Site Reliability"]));
    expect(r.credits[0].matchedBy).toBe("synonym");
    expect(r.score).toBeGreaterThanOrEqual(90); // 0.9 + spread, capped at 1.0 → 100
  });

  it("returns 0 (not NaN) when the JD lists no skills", () => {
    const r = scoreKeywordsV2(baseResume, jd([]));
    expect(r.score).toBe(0);
    expect(r.credits).toEqual([]);
  });

  it("applies IDF normalization when provided", () => {
    const idf = new Map<string, number>([
      ["React", 0.5],
      ["GraphQL", 1.0],
    ]);
    const r = scoreKeywordsV2(baseResume, jd(["React"], ["GraphQL"]), idf);
    // effective weights: React 2*0.5=1.0 (credit 1.0), GraphQL 1*1.0=1.0 (credit 0)
    // (1.0*1.0 + 1.0*0) / 2.0 = 50
    expect(r.score).toBe(50);
    expect(r.credits.find((c) => c.skill === "React")?.effectiveWeight).toBe(
      1.0,
    );
  });
});
```

- [ ] **Step 2: Run — must FAIL (`keyword-scorer.js` not found)**

Run: `cd apps/server && npx vitest run src/tests/keyword-scorer.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `keyword-scorer.ts`**

```typescript
/**
 * Keyword phase v2 for ATS scoring.
 *
 * Replaces the v1 token-set + substring match with graded credit:
 *   exact (1.0) > synonym (0.9, via the shared skill-matcher synonym groups)
 *   > multi-word token-subset (0.75) > none (0),
 * plus a +0.1 section-spread bonus (capped at 1.0) when the skill appears in
 * 2+ of the 4 resume sections, and optional IDF weighting from the user's
 * CanonicalJob corpus (skill-idf.service). Weights stay required=2, preferred=1.
 *
 * Pure and synchronous — the IDF map is injected by the caller.
 */
import { escapeRegex, getSynonymRegexString } from "../utils/skill-matcher.js";
import type { IParsedJD } from "../models/Job.model.js";
import type { ResumeContent } from "./ats-scoring.service.js";

export type MatchedBy = "exact" | "synonym" | "token-subset" | "none";

export interface SkillCredit {
  skill: string;
  weight: number;
  credit: number;
  matchedBy: MatchedBy;
  sections: number;
  effectiveWeight: number;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s+#.-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1),
  );
}

function sectionTexts(resume: ResumeContent): string[] {
  return [
    resume.summary ?? "",
    (resume.skills ?? []).map((s) => s.name).join(" "),
    (resume.experience ?? [])
      .flatMap((e) => (e.bullets ?? []).map((b) => b.text))
      .join(" "),
    (resume.projects ?? [])
      .flatMap((p) => [...(p.techStack ?? []), ...(p.highlights ?? [])])
      .join(" "),
  ];
}

export function scoreKeywordsV2(
  resume: ResumeContent,
  jd: IParsedJD,
  idfNorm?: Map<string, number>,
): { score: number; credits: SkillCredit[] } {
  const sections = sectionTexts(resume).map((s) => s.toLowerCase());
  const fullText = sections.join(" ");
  const resumeTokens = tokenize(fullText);

  const weighted: Array<{ skill: string; weight: number }> = [
    ...jd.requiredSkills.map((skill) => ({ skill, weight: 2 })),
    ...jd.preferredSkills.map((skill) => ({ skill, weight: 1 })),
  ];

  let totalEffective = 0;
  let earnedEffective = 0;
  const credits: SkillCredit[] = [];

  for (const { skill, weight } of weighted) {
    const exactRe = new RegExp(`(?<!\\w)${escapeRegex(skill)}(?!\\w)`, "i");
    const synonymRe = new RegExp(getSynonymRegexString(skill), "i");

    let matchedBy: MatchedBy = "none";
    let credit = 0;
    if (exactRe.test(fullText)) {
      matchedBy = "exact";
      credit = 1.0;
    } else if (synonymRe.test(fullText)) {
      matchedBy = "synonym";
      credit = 0.9;
    } else {
      const tokens = skill
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 2);
      if (tokens.length >= 2 && tokens.every((t) => resumeTokens.has(t))) {
        matchedBy = "token-subset";
        credit = 0.75;
      }
    }

    // Section spread: count sections that contain any form of the skill.
    let matchedSections = 0;
    if (matchedBy !== "none") {
      for (const section of sections) {
        if (exactRe.test(section) || synonymRe.test(section))
          matchedSections += 1;
      }
      if (matchedSections >= 2) credit = Math.min(1.0, credit + 0.1);
    }

    const effectiveWeight = weight * (idfNorm?.get(skill) ?? 1);
    totalEffective += effectiveWeight;
    earnedEffective += effectiveWeight * credit;
    credits.push({
      skill,
      weight,
      credit,
      matchedBy,
      sections: matchedSections,
      effectiveWeight,
    });
  }

  const score =
    totalEffective > 0
      ? Math.round((earnedEffective / totalEffective) * 100)
      : 0;
  return { score, credits };
}
```

- [ ] **Step 4: Run — must PASS (6 tests)**

Run: `cd apps/server && npx vitest run src/tests/keyword-scorer.test.ts`
Expected: 6 passed. If a spread-bonus expectation is off by the cap, recheck rule 3 arithmetic before touching the implementation — the rules above are frozen.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add apps/server/src/services/keyword-scorer.ts apps/server/src/tests/keyword-scorer.test.ts
git commit -m "feat(server): keyword scorer v2 with synonym grading and section spread" -m "Pure module, not yet wired into scoreATS. Uses the shared skill-matcher
synonym groups (react/node/devops-sre/ts/js) that previously only search used.
Graded credit: exact 1.0, synonym 0.9, multi-word token-subset 0.75, plus a
+0.1 two-section spread bonus capped at 1.0. Optional IDF weighting injected."
```

---

### Task 4: Skill IDF service (corpus distinctiveness, graceful degeneration)

**Files:**

- Create: `apps/server/src/services/skill-idf.service.ts`
- Create: `apps/server/src/tests/skill-idf.test.ts`

**Interfaces:**

- Consumes: `CanonicalJob` model (field `description: string`, `createdAt`), `getSynonymRegexString` from `../utils/skill-matcher.js`, test-db helpers.
- Produces (Task 5 consumes):
  - `export async function computeSkillIdfMap(skills: string[]): Promise<Map<string, number>>` — normalized IDF per skill in (0, 1]; **empty map when the corpus is empty** (caller then behaves exactly like unweighted v2).
  - `export function clearIdfCache(): void` (test hook).

**Frozen rules:**

1. Corpus = newest ≤ 500 `CanonicalJob` docs, `description` only (`.sort({ createdAt: -1 }).limit(500).select("description").lean()`), fetched at most once per hour (module-level `{ at: number; docs: string[] }` cache; `clearIdfCache()` resets).
2. `df(skill)` = number of corpus docs whose lowercased description matches `new RegExp(getSynonymRegexString(skill), "i")`.
3. `idf(skill) = ln(1 + N / (1 + df))` where `N` = fetched corpus size.
4. `idfNorm(skill) = idf(skill) / maxIdf` across the requested skills (max ≤ 0 → return empty map). Rounded to 4 decimals for stable tests.
5. Any DB error → log via `console.warn` (baselined pattern) and return an empty map; scoring must never fail because IDF failed.

- [ ] **Step 1: Write the failing tests**

Create `apps/server/src/tests/skill-idf.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectTestDb, disconnectTestDb } from "./helpers/test-db.js";
import { CanonicalJob } from "../models/CanonicalJob.model.js";
import {
  computeSkillIdfMap,
  clearIdfCache,
} from "../services/skill-idf.service.js";

process.env.NODE_ENV = "test";

async function seedJob(title: string, description: string) {
  await CanonicalJob.create({
    sourceType: "manual",
    sourceName: "test",
    jobTitle: title,
    companyName: "Corp",
    description,
    dedupeKey: `corp_${title.toLowerCase()}_test`,
  });
}

describe("computeSkillIdfMap", () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  beforeEach(async () => {
    await CanonicalJob.deleteMany({});
    clearIdfCache();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("returns an empty map when the corpus is empty (graceful degeneration)", async () => {
    const map = await computeSkillIdfMap(["React", "Kubernetes"]);
    expect(map.size).toBe(0);
  });

  it("weights rare skills higher than common ones", async () => {
    // 'communication' appears in all 3 docs; 'kubernetes' in 1 → kubernetes rarer
    await seedJob(
      "a",
      "Strong communication skills required. React and Kubernetes.",
    );
    await seedJob("b", "Great communication and React knowledge.");
    await seedJob("c", "Excellent communication, React frontend.");
    const map = await computeSkillIdfMap([
      "React",
      "Kubernetes",
      "communication",
    ]);
    expect(map.size).toBe(3);
    expect(map.get("Kubernetes")!).toBeGreaterThan(map.get("React")!);
    expect(map.get("React")!).toBeGreaterThan(map.get("communication")!);
    // normalized: the rarest skill maps to 1
    expect(map.get("Kubernetes")).toBe(1);
  });

  it("uses synonym expansion for df counting (SRE doc counts for Site Reliability)", async () => {
    await seedJob("sre1", "We need an SRE for on-call rotation.");
    await seedJob("other", "Frontend React role.");
    const map = await computeSkillIdfMap(["Site Reliability"]);
    // df=1 of N=2 → idf = ln(1 + 2/2) = ln 2; single skill → normalized to 1
    expect(map.get("Site Reliability")).toBe(1);
  });

  it("serves repeated calls from the in-process cache", async () => {
    await seedJob("x", "React role.");
    const first = await computeSkillIdfMap(["React"]);
    await CanonicalJob.deleteMany({}); // cache must mask this change
    const second = await computeSkillIdfMap(["React"]);
    expect(second.get("React")).toBe(first.get("React"));
    clearIdfCache();
    const third = await computeSkillIdfMap(["React"]);
    expect(third.size).toBe(0); // cache cleared → corpus genuinely empty now
  });
});
```

**Before writing the implementation**, open `apps/server/src/models/CanonicalJob.model.ts` and check which fields are `required` — adjust `seedJob` to satisfy them (the fields used above mirror what `ingestion.service.ts` sets: `sourceType`, `sourceName`, `jobTitle`, `companyName`, `description`, `dedupeKey`). Do not invent fields the schema does not have.

- [ ] **Step 2: Run — must FAIL (module not found)**

Run: `cd apps/server && npx vitest run src/tests/skill-idf.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `skill-idf.service.ts`**

```typescript
/**
 * Inverse-document-frequency weighting for ATS keyword scoring, computed
 * from the user-visible CanonicalJob corpus (populated by live job discovery).
 * Distinctive skills ("Kubernetes") outweigh ubiquitous ones ("communication").
 *
 * Design constraints:
 * - Bounded corpus: newest 500 descriptions, fetched at most once per hour.
 * - Graceful degeneration: empty corpus or any DB error → empty map, and the
 *   keyword scorer falls back to plain required/preferred weights.
 */
import { CanonicalJob } from "../models/CanonicalJob.model.js";
import { getSynonymRegexString } from "../utils/skill-matcher.js";

const CORPUS_CAP = 500;
const CACHE_TTL_MS = 60 * 60 * 1000;

let corpusCache: { at: number; docs: string[] } | null = null;

export function clearIdfCache(): void {
  corpusCache = null;
}

async function loadCorpus(): Promise<string[]> {
  const now = Date.now();
  if (corpusCache && now - corpusCache.at < CACHE_TTL_MS)
    return corpusCache.docs;
  const docs = await CanonicalJob.find()
    .sort({ createdAt: -1 })
    .limit(CORPUS_CAP)
    .select("description")
    .lean();
  const texts = docs
    .map((d) =>
      String((d as { description?: unknown }).description ?? "").toLowerCase(),
    )
    .filter((t) => t.length > 0);
  corpusCache = { at: now, docs: texts };
  return texts;
}

export async function computeSkillIdfMap(
  skills: string[],
): Promise<Map<string, number>> {
  const unique = Array.from(new Set(skills.filter((s) => s.trim().length > 0)));
  if (unique.length === 0) return new Map();
  try {
    const corpus = await loadCorpus();
    if (corpus.length === 0) return new Map();

    const n = corpus.length;
    const idf = new Map<string, number>();
    let maxIdf = 0;
    for (const skill of unique) {
      const re = new RegExp(getSynonymRegexString(skill), "i");
      const df = corpus.reduce(
        (count, doc) => (re.test(doc) ? count + 1 : count),
        0,
      );
      const value = Math.log(1 + n / (1 + df));
      idf.set(skill, value);
      if (value > maxIdf) maxIdf = value;
    }
    if (maxIdf <= 0) return new Map();

    const normalized = new Map<string, number>();
    for (const [skill, value] of idf) {
      normalized.set(skill, Math.round((value / maxIdf) * 10000) / 10000);
    }
    return normalized;
  } catch (err) {
    console.warn(
      "[skill-idf] corpus unavailable, scoring without IDF weighting:",
      err,
    );
    return new Map();
  }
}
```

- [ ] **Step 4: Run — must PASS (4 tests)**

Run: `cd apps/server && npx vitest run src/tests/skill-idf.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add apps/server/src/services/skill-idf.service.ts apps/server/src/tests/skill-idf.test.ts
git commit -m "feat(server): skill IDF service from CanonicalJob corpus with 1h cache" -m "Bounded to the newest 500 descriptions; synonym-aware df via skill-matcher;
empty corpus or DB error degrades to an empty map so keyword scoring falls
back to plain required/preferred weights."
```

---

### Task 5: Wire v2 into `scoreATS` + golden rebaseline with recorded deltas

**Files:**

- Modify: `apps/server/src/services/ats-scoring.service.ts`
- Modify: `apps/server/src/tests/ats-golden.test.ts` (flip `ENGINE_UNDER_TEST` to `"v2"`)
- Modify: `apps/server/src/tests/fixtures/ats-golden-cases.json` (fill `v2` block per case)

**Interfaces:**

- Consumes: `scoreKeywordsV2` (Task 3), `computeSkillIdfMap` (Task 4), `ATS_ENGINE_VERSION` — defined HERE as `export const ATS_ENGINE_VERSION = 2;` (Task 6's cache key imports it from this module to avoid a cycle: score-cache → ats-scoring is fine; ats-scoring → score-cache must NOT exist).
- Produces: `scoreATS` now returns `engineVersion: 2` on every `IATSScore`; same signature `(resume, jd) => Promise<IATSScore>`.

**Frozen decisions:**

- `calculateKeywordScore` (v1 function) is **deleted** — no dual path, no feature flag. The golden file records the v1 numbers permanently.
- IDF is computed per `scoreATS` call from `[...jd.requiredSkills, ...jd.preferredSkills]` (the service's 1-hour corpus cache makes this cheap). IDF map may be empty (tests, fresh installs) — scorer then uses plain weights.
- Weights, degraded renormalization, breakdown builders, action items, and the semantic phase are untouched.

- [ ] **Step 1: Update the golden file with v2 expectations**

In `ats-golden-cases.json`, add to each case (v1 block stays — it is the recorded delta history):

- Case A: `"v2": { "keywordMatchScore": 80, "degradedOverallScore": 80 }` — React/Node.js still exact-matched (credit 1.0 + spread cap 1.0); TypeScript still unmatched ("ts" does not appear in that resume). **Delta: 0.**
- Case B: `"v2": { "keywordMatchScore": 95, "degradedOverallScore": 78 }` — TypeScript now synonym-matches via "TS" (0.9): `(2×1.0 + 2×0.9)/4 = 95`; degraded overall `round(95×0.55 + 55×0.25 + 60×0.20) = 78`. **Delta: keyword +45, overall +25.**
- Case C: `"v2": { "keywordMatchScore": 100, "degradedOverallScore": 81 }` — Site Reliability synonym-matches "SRE" (0.9 + 0.1 spread = 1.0): 100; degraded overall `round(100×0.55 + 55×0.25 + 60×0.20) = 81`. **Delta: keyword +100, overall +55.**
- Case D: `"v2": { "keywordMatchScore": 0, "degradedOverallScore": 18 }`. **Delta: 0.**

(Golden tests run against an empty CanonicalJob collection → IDF map empty → plain weights, so these values are exact. Verify each against the frozen rules before running.)

- [ ] **Step 2: Flip the golden test to v2**

In `ats-golden.test.ts` change:

```typescript
const ENGINE_UNDER_TEST = "v1" as "v1" | "v2";
```

to:

```typescript
const ENGINE_UNDER_TEST = "v2" as "v1" | "v2";
```

- [ ] **Step 3: Run golden + existing ATS tests — golden must FAIL (engine still v1)**

Run: `cd apps/server && npx vitest run src/tests/ats-golden.test.ts`
Expected: cases B and C FAIL (v1 engine still returns 50/0 keyword).

- [ ] **Step 4: Wire v2 into `scoreATS`**

In `ats-scoring.service.ts`:

1. Add imports and the engine constant (top of file, after existing imports):

```typescript
import { scoreKeywordsV2 } from "./keyword-scorer.js";
import { computeSkillIdfMap } from "./skill-idf.service.js";

/** Stamped on every IATSScore produced by this engine (see Resume.model atsSchema). */
export const ATS_ENGINE_VERSION = 2;
```

2. Delete the `extractKeywords` and `calculateKeywordScore` functions entirely.

3. Replace the phase block inside `scoreATS`:

```typescript
// Run independent scoring phases in parallel
const [semanticResult, keywordScore, sectionScore, formatScore] =
  await Promise.all([
    semanticScore(resume, jd),
    Promise.resolve(calculateKeywordScore(resume, jd)),
    Promise.resolve(calculateSectionCompleteness(resume)),
    Promise.resolve(calculateFormatScore(resume)),
  ]);
```

with:

```typescript
// Run independent scoring phases in parallel. The keyword phase is v2:
// synonym-aware graded credit, optionally IDF-weighted from the CanonicalJob
// corpus (empty map → plain required/preferred weights).
const [semanticResult, keywordResult, sectionScore, formatScore] =
  await Promise.all([
    semanticScore(resume, jd),
    computeSkillIdfMap([...jd.requiredSkills, ...jd.preferredSkills]).then(
      (idfNorm) => scoreKeywordsV2(resume, jd, idfNorm),
    ),
    Promise.resolve(calculateSectionCompleteness(resume)),
    Promise.resolve(calculateFormatScore(resume)),
  ]);
const keywordScore = keywordResult.score;
```

4. In the returned object, add the engine stamp (keep every existing field):

```typescript
return {
  overallScore,
  keywordMatchScore: keywordScore,
  semanticMatchScore: semanticDegraded ? 0 : semanticScoreValue,
  sectionCompletenessScore: sectionScore,
  formatScore: formatScore,
  semanticScoreDegraded: semanticDegraded || undefined,
  engineVersion: ATS_ENGINE_VERSION,
  breakdown: {
    matchedSkills,
    missingSkills,
    weakSkills,
    actionItems,
  },
};
```

5. Update the pipeline doc comment above `scoreATS`: replace "Phase 1: Keyword matching (TF-IDF style) — 35% weight" with "Phase 1: Keyword matching v2 (synonym-aware graded credit, IDF-weighted) — 35% weight".

- [ ] **Step 5: Run golden + existing ATS + full server suite**

```bash
cd apps/server && npx vitest run src/tests/ats-golden.test.ts src/tests/ats-scoring.test.ts
```

Expected: golden 4/4 PASS (B=95, C=100 now); existing `ats-scoring.test.ts` 5/5 PASS unmodified (fixture A math is identical under v2: React/Node.js exact 1.0, TypeScript unmatched — the existing test asserts keyword 80 and it stays 80).

Then the full suite (catches unexpected consumers):

```bash
npm run test --workspace=job-tailor-server
```

Expected: all files pass. **If `search-engine.test.ts` or ingestion tests shift:** they must not — this task changes no ingestion code. A shift means an unintended import cycle; fix before committing.

- [ ] **Step 6: Typecheck + commit**

```bash
npm run typecheck
git add apps/server/src/services/ats-scoring.service.ts apps/server/src/tests/ats-golden.test.ts apps/server/src/tests/fixtures/ats-golden-cases.json
git commit -m "feat(server): ATS keyword phase v2 wired into scoreATS (engine v2)" -m "Synonym-aware graded credit + IDF weighting replace the token-set match.
Golden rebaseline: case B keyword 50->95, case C 0->100; cases A/D unchanged.
v1 values kept in the golden file as the recorded delta history. Weights and
degraded policy untouched."
```

---

### Task 6: Score cache + `quickATSCheck` wiring

**Files:**

- Create: `apps/server/src/services/score-cache.ts`
- Create: `apps/server/src/tests/score-cache.test.ts`
- Modify: `apps/server/src/controllers/resume.controller.ts` (`quickATSCheck` only)

**Interfaces:**

- Consumes: `IATSScore` (Resume.model), `ATS_ENGINE_VERSION` (ats-scoring.service — import direction cache→scoring is forbidden; instead the key builder takes engineVersion as a parameter so score-cache imports NOTHING from ats-scoring: `scoreKey(resumeContent, jd, engineVersion)`).
- Produces (Task 7 may use `scoreKey`; rescore NEVER reads the cache):
  - `export function deterministicStringify(value: unknown): string` (keys sorted recursively)
  - `export function scoreKey(resumeContent: unknown, jd: unknown, engineVersion: number): string` (sha256 hex of `deterministicStringify({ resumeContent, jd, engineVersion })`)
  - `export const scoreCache: { get(key: string): IATSScore | undefined; set(key: string, score: IATSScore): void; clear(): void; readonly size: number }` — LRU max 200 entries, TTL 3 600 000 ms.
- **Frozen rule:** results with `semanticScoreDegraded === true` are NEVER stored (a retry after LLM recovery must get a full score). Cache lives in process memory only — the design doc (§13) establishes single-instance deployment; no Redis, no persistence.

- [ ] **Step 1: Write the failing tests**

Create `apps/server/src/tests/score-cache.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  scoreCache,
  scoreKey,
  deterministicStringify,
} from "../services/score-cache.js";
import type { IATSScore } from "../models/Resume.model.js";

function fakeScore(overrides: Partial<IATSScore> = {}): IATSScore {
  return {
    overallScore: 70,
    keywordMatchScore: 70,
    semanticMatchScore: 70,
    sectionCompletenessScore: 70,
    formatScore: 70,
    breakdown: {
      matchedSkills: [],
      missingSkills: [],
      weakSkills: [],
      actionItems: [],
    },
    ...overrides,
  };
}

describe("score-cache", () => {
  beforeEach(() => {
    scoreCache.clear();
    vi.useRealTimers();
  });

  it("deterministicStringify is key-order independent", () => {
    expect(deterministicStringify({ a: 1, b: { x: 2, y: 3 } })).toBe(
      deterministicStringify({ b: { y: 3, x: 2 }, a: 1 }),
    );
  });

  it("scoreKey changes with engine version and content", () => {
    const k1 = scoreKey({ s: "a" }, { j: 1 }, 2);
    expect(scoreKey({ s: "a" }, { j: 1 }, 2)).toBe(k1);
    expect(scoreKey({ s: "b" }, { j: 1 }, 2)).not.toBe(k1);
    expect(scoreKey({ s: "a" }, { j: 1 }, 1)).not.toBe(k1);
  });

  it("round-trips a score and reports size", () => {
    const key = scoreKey({ r: 1 }, { j: 1 }, 2);
    expect(scoreCache.get(key)).toBeUndefined();
    scoreCache.set(key, fakeScore({ overallScore: 82 }));
    expect(scoreCache.get(key)?.overallScore).toBe(82);
    expect(scoreCache.size).toBe(1);
  });

  it("refuses to store degraded results", () => {
    const key = scoreKey({ r: 2 }, { j: 2 }, 2);
    scoreCache.set(key, fakeScore({ semanticScoreDegraded: true }));
    expect(scoreCache.get(key)).toBeUndefined();
    expect(scoreCache.size).toBe(0);
  });

  it("expires entries after the TTL", () => {
    vi.useFakeTimers();
    const key = scoreKey({ r: 3 }, { j: 3 }, 2);
    scoreCache.set(key, fakeScore());
    vi.advanceTimersByTime(60 * 60 * 1000 + 1);
    expect(scoreCache.get(key)).toBeUndefined();
  });

  it("evicts the least-recently-used entry beyond capacity", () => {
    for (let i = 0; i < 201; i++) {
      scoreCache.set(scoreKey({ i }, {}, 2), fakeScore({ overallScore: i }));
    }
    expect(scoreCache.size).toBe(200);
    expect(scoreCache.get(scoreKey({ i: 0 }, {}, 2))).toBeUndefined(); // LRU evicted
    expect(scoreCache.get(scoreKey({ i: 200 }, {}, 2))?.overallScore).toBe(200);
  });
});
```

- [ ] **Step 2: Run — must FAIL (module not found)**

Run: `cd apps/server && npx vitest run src/tests/score-cache.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `score-cache.ts`**

```typescript
/**
 * In-process LRU+TTL cache for ATS scores.
 *
 * Key: sha256 of the deterministic (key-sorted) serialization of
 * { resumeContent, parsedJD, engineVersion } — so a new engine version can
 * never serve an old score. Degraded results (semantic phase failed) are
 * never cached: a retry after provider recovery must get a full score.
 *
 * Single-instance deployment (design doc §13) — deliberately no Redis or
 * persistence; a restart simply starts cold.
 */
import { createHash } from "node:crypto";
import type { IATSScore } from "../models/Resume.model.js";

const MAX_ENTRIES = 200;
const TTL_MS = 60 * 60 * 1000;

export function deterministicStringify(value: unknown): string {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value) ?? "null";
  if (Array.isArray(value))
    return `[${value.map(deterministicStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${deterministicStringify(record[k])}`).join(",")}}`;
}

export function scoreKey(
  resumeContent: unknown,
  jd: unknown,
  engineVersion: number,
): string {
  return createHash("sha256")
    .update(deterministicStringify({ resumeContent, jd, engineVersion }))
    .digest("hex");
}

interface CacheEntry {
  score: IATSScore;
  expiresAt: number;
}

class ScoreCache {
  private map = new Map<string, CacheEntry>();

  get(key: string): IATSScore | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // LRU touch: re-insert to move to the newest position
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.score;
  }

  set(key: string, score: IATSScore): void {
    if (score.semanticScoreDegraded === true) return; // never cache degraded
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { score, expiresAt: Date.now() + TTL_MS });
    while (this.map.size > MAX_ENTRIES) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

export const scoreCache = new ScoreCache();
```

- [ ] **Step 4: Run — must PASS (6 tests)**

Run: `cd apps/server && npx vitest run src/tests/score-cache.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Wire into `quickATSCheck`**

In `apps/server/src/controllers/resume.controller.ts`:

1. Add imports at the top:

```typescript
import { scoreCache, scoreKey } from "../services/score-cache.js";
import { ATS_ENGINE_VERSION } from "../services/ats-scoring.service.js";
```

2. In `quickATSCheck`, replace the direct scoring block:

```typescript
// Calculate ATS score using existing service
const atsScore = await scoreATS(
  {
    summary: resumeToUse.tailoredSummary || "",
    skills: resumeToUse.skills as any,
    experience: resumeToUse.experience as any,
    projects: resumeToUse.projects as any,
  },
  job.parsedJD,
);
```

with:

```typescript
// Calculate ATS score (v2 engine), served from the in-process cache when
// the same resume content × parsed JD × engine version was scored before.
const resumeContent = {
  summary: resumeToUse.tailoredSummary || "",
  skills: resumeToUse.skills as any,
  experience: resumeToUse.experience as any,
  projects: resumeToUse.projects as any,
};
const cacheKey = scoreKey(resumeContent, job.parsedJD, ATS_ENGINE_VERSION);
let atsScore = scoreCache.get(cacheKey);
if (!atsScore) {
  atsScore = await scoreATS(resumeContent, job.parsedJD);
  scoreCache.set(cacheKey, atsScore);
}
```

**Scope guard:** do NOT add caching to `generateResume` (tailored content is new per call — it would never hit) and do NOT let Task 7's rescore read the cache.

- [ ] **Step 6: Run the resume + cache suites, then typecheck + commit**

```bash
cd apps/server && npx vitest run src/tests/score-cache.test.ts src/tests/resume.test.ts
npm run typecheck
git add apps/server/src/services/score-cache.ts apps/server/src/tests/score-cache.test.ts apps/server/src/controllers/resume.controller.ts
git commit -m "feat(server): in-process ATS score cache wired into quick-ats-check" -m "LRU(200)+TTL(1h) keyed on sha256 of resume content, parsed JD, and engine
version. Degraded results are never cached. generateResume and rescore
deliberately bypass the cache."
```

---

### Task 7: `POST /resumes/:id/rescore` — compare, never overwrite

**Files:**

- Create: `apps/server/src/controllers/resume-rescore.controller.ts`
- Modify: `apps/server/src/routes/resume.routes.ts`
- Create: `apps/server/src/tests/resume-rescore.test.ts`

**Interfaces:**

- Consumes: `Resume`, `Job` models; `scoreATS` + `ATS_ENGINE_VERSION`; `scoreKey`/`scoreCache` (write-through: a rescore result populates the cache for later quick-checks but never reads it); `validateParams(idParamSchema)` pattern copied from `resume.routes.ts` existing routes; `asyncHandler` from `../middleware/error-handler.js`.
- Produces: `export async function rescoreResume(req: Request, res: Response): Promise<void>` mounted as `router.post("/:id/rescore", validateParams(idParamSchema), rescoreResume)`.

**Frozen response contract (200):**

```json
{
  "success": true,
  "data": {
    "resumeId": "...",
    "stored": {
      "overallScore": 53,
      "keywordMatchScore": 50,
      "engineVersion": null
    },
    "fresh": {
      "overallScore": 78,
      "keywordMatchScore": 95,
      "engineVersion": 2
    },
    "delta": { "overallScore": 25, "keywordMatchScore": 45 },
    "overwritten": false
  }
}
```

`stored.engineVersion` is `null` when the stored score predates the field (v1 provenance). Errors: `RESUME_NOT_FOUND` (404, ownership-scoped query), `JOB_NOT_FOUND` (404 — resume has no `jobId` or job deleted), `JD_NOT_PARSED` (400). The resume document is **never modified** — asserted in tests.

- [ ] **Step 1: Write the failing tests**

Create `apps/server/src/tests/resume-rescore.test.ts`. Model it on the existing controller-test conventions (`apikey.test.ts` / `application-from-extension.test.ts`): real `connectTestDb`, seed `User` (bcrypt hash), `Job` with `parsedJD`, `Resume` with a v1-style `atsScore`; mount via a minimal express app:

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import bcrypt from "bcryptjs";
import { connectTestDb, disconnectTestDb } from "./helpers/test-db.js";
import { Resume } from "../models/Resume.model.js";
import { Job } from "../models/Job.model.js";
import { User } from "../models/User.model.js";
import { rescoreResume } from "../controllers/resume-rescore.controller.js";

process.env.NODE_ENV = "test";

// Deterministic semantic phase: provider fails → degraded math, no AI calls.
vi.mock("../services/ai-provider/provider-manager.js", () => ({
  aiProviderManager: {
    generateStructuredOutput: vi
      .fn()
      .mockRejectedValue(new Error("rescore test: provider off")),
  },
}));

const userIdStr = () => "507f1f77bcf86cd799439011";

function makeApp(userId: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { userId, email: "t@t.co" };
    next();
  });
  app.post("/resumes/:id/rescore", rescoreResume);
  return app;
}

const parsedJD = {
  summary: "Frontend platform role",
  seniorityLevel: "mid",
  focusWeights: { frontend: 100, backend: 0, devops: 0, ai: 0, mobile: 0 },
  requiredSkills: ["React", "TypeScript"],
  preferredSkills: [],
  responsibilities: [],
  qualifications: [],
  niceToHaves: [],
  tone: "technical",
};

describe("POST /resumes/:id/rescore", () => {
  let userId: string;
  let jobId: string;
  let resumeId: string;

  beforeAll(async () => {
    await connectTestDb();
    const u = await User.create({
      email: "rescore@test.co",
      passwordHash: bcrypt.hashSync("password123", 10),
      firstName: "R",
      lastName: "S",
      emailVerified: true,
    });
    userId = String(u._id);
    const job = await Job.create({
      userId: u._id,
      companyName: "Beta",
      jobTitle: "Frontend Engineer",
      jdRawText: "Build React.js dashboards and TS tooling at scale.",
      parsedJD,
    });
    jobId = String(job._id);
    const resume = await Resume.create({
      userId: u._id,
      jobId: job._id,
      version: 1,
      versionLabel: "v1-stored",
      tailoredSummary: "Built React.js dashboards and TS tooling.",
      skills: [
        {
          name: "React.js",
          category: "frontend",
          yearsOfExperience: 2,
          proficiency: "advanced",
        },
      ],
      experience: [
        {
          company: "Beta",
          role: "FE",
          startDate: "2023",
          endDate: null,
          location: "Remote",
          isCurrentRole: true,
          bullets: [
            { id: "b1", text: "Shipped React.js component library.", tags: [] },
          ],
        },
      ],
      projects: [],
      atsScore: {
        overallScore: 53,
        keywordMatchScore: 50,
        semanticMatchScore: 0,
        sectionCompletenessScore: 55,
        formatScore: 60,
        semanticScoreDegraded: true,
        breakdown: {
          matchedSkills: [],
          missingSkills: [],
          weakSkills: [],
          actionItems: [],
        },
      },
    });
    resumeId = String(resume._id);
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("returns stored vs fresh with delta and never overwrites", async () => {
    const res = await request(makeApp(userId)).post(
      `/resumes/${resumeId}/rescore`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.overwritten).toBe(false);
    expect(res.body.data.stored).toMatchObject({
      overallScore: 53,
      engineVersion: null,
    });
    expect(res.body.data.fresh.engineVersion).toBe(2);
    expect(res.body.data.fresh.keywordMatchScore).toBe(95); // golden case B math
    expect(res.body.data.delta.keywordMatchScore).toBe(45);

    const reloaded = await Resume.findById(resumeId).lean();
    expect(reloaded?.atsScore?.overallScore).toBe(53); // untouched
    expect(reloaded?.atsScore?.engineVersion).toBeUndefined();
  });

  it("404s for another user's resume", async () => {
    const res = await request(makeApp(userIdStr())).post(
      `/resumes/${resumeId}/rescore`,
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("RESUME_NOT_FOUND");
  });

  it("400s when the job has no parsedJD", async () => {
    const job2 = await Job.create({
      userId,
      companyName: "NoParse",
      jobTitle: "Role",
      jdRawText: "raw text only",
    });
    const r2 = await Resume.create({
      userId,
      jobId: job2._id,
      version: 1,
      versionLabel: "v1-noparse",
      tailoredSummary: "Summary.",
      skills: [],
      experience: [],
      projects: [],
    });
    const res = await request(makeApp(userId)).post(
      `/resumes/${r2._id}/rescore`,
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("JD_NOT_PARSED");
  });
});
```

**Executor note:** before running, open `apps/server/src/models/Job.model.ts` and confirm the exact `req.user` shape the existing controllers use (`req.user!.userId` per `resume.controller.ts`) and Job's required fields — adjust the seeds to the real schema (the fields above mirror `job-upsert.test.ts`). Remove the unused `userIdStr` helper or use it as shown.

- [ ] **Step 2: Run — must FAIL (controller module not found)**

Run: `cd apps/server && npx vitest run src/tests/resume-rescore.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the controller**

Create `apps/server/src/controllers/resume-rescore.controller.ts`:

```typescript
import { Request, Response } from "express";
import { Resume } from "../models/Resume.model.js";
import { Job } from "../models/Job.model.js";
import {
  scoreATS,
  ATS_ENGINE_VERSION,
} from "../services/ats-scoring.service.js";
import { scoreCache, scoreKey } from "../services/score-cache.js";

/**
 * POST /api/v1/resumes/:id/rescore
 *
 * Re-runs the current scoring engine against the resume's stored content and
 * its job's parsedJD, and returns stored vs fresh with deltas. NEVER writes
 * to the resume — stored scores are immutable per version (design doc §11).
 * Bypasses the cache read (the point is a fresh comparison) but writes the
 * fresh result through so a following quick-check can reuse it.
 */
export async function rescoreResume(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = req.user!.userId;
  const resume = await Resume.findOne({ _id: req.params.id, userId });
  if (!resume) {
    res.status(404).json({
      success: false,
      error: {
        code: "RESUME_NOT_FOUND",
        message: "Resume not found or access denied.",
      },
    });
    return;
  }

  if (!resume.jobId) {
    res.status(404).json({
      success: false,
      error: {
        code: "JOB_NOT_FOUND",
        message: "Resume is not linked to a job.",
      },
    });
    return;
  }
  const job = await Job.findOne({ _id: resume.jobId, userId });
  if (!job) {
    res.status(404).json({
      success: false,
      error: {
        code: "JOB_NOT_FOUND",
        message: "Linked job not found or access denied.",
      },
    });
    return;
  }
  if (!job.parsedJD) {
    res.status(400).json({
      success: false,
      error: {
        code: "JD_NOT_PARSED",
        message: "Job description must be parsed first.",
      },
    });
    return;
  }

  const resumeContent = {
    summary: resume.tailoredSummary || "",
    skills: resume.skills as never,
    experience: resume.experience as never,
    projects: resume.projects as never,
  };
  const fresh = await scoreATS(resumeContent, job.parsedJD);
  scoreCache.set(
    scoreKey(resumeContent, job.parsedJD, ATS_ENGINE_VERSION),
    fresh,
  );

  const stored = resume.atsScore;
  res.json({
    success: true,
    data: {
      resumeId: String(resume._id),
      stored: {
        overallScore: stored?.overallScore ?? null,
        keywordMatchScore: stored?.keywordMatchScore ?? null,
        engineVersion: stored?.engineVersion ?? null,
      },
      fresh: {
        overallScore: fresh.overallScore,
        keywordMatchScore: fresh.keywordMatchScore,
        engineVersion: fresh.engineVersion,
      },
      delta: {
        overallScore: fresh.overallScore - (stored?.overallScore ?? 0),
        keywordMatchScore:
          fresh.keywordMatchScore - (stored?.keywordMatchScore ?? 0),
      },
      overwritten: false,
    },
  });
}
```

**Executor note:** match the error-handling convention of `resume.controller.ts` — if its handlers wrap bodies in `try/catch` or the routes wrap with `asyncHandler`, do the same here (check `resume.routes.ts`: existing routes call controllers directly; `quickATSCheck` uses an inner try/catch → mirror that: wrap the body in `try { ... } catch (err) { console.error(...); res.status(500)... }` exactly as `quickATSCheck` does).

- [ ] **Step 4: Mount the route**

In `apps/server/src/routes/resume.routes.ts`, next to the other `/:id` routes (copy the exact `validateParams`/`idParamSchema` imports already used in that file):

```typescript
router.post("/:id/rescore", validateParams(idParamSchema), rescoreResume);
```

with the import added alongside the existing controller imports:

```typescript
import { rescoreResume } from "../controllers/resume-rescore.controller.js";
```

**Placement rule:** register it near `/:id/pdf` — after the static routes (`/generate`, `/profile`, `/reuse`, `/upload`, `/quick-ats-check`) so no static path can be swallowed by `/:id`.

- [ ] **Step 5: Run — must PASS (3 tests), then full suite + typecheck**

```bash
cd apps/server && npx vitest run src/tests/resume-rescore.test.ts
npm run test --workspace=job-tailor-server
npm run typecheck
```

Expected: 3 passed; full suite green (163+ tests).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/controllers/resume-rescore.controller.ts apps/server/src/routes/resume.routes.ts apps/server/src/tests/resume-rescore.test.ts
git commit -m "feat(server): POST /resumes/:id/rescore compares fresh v2 vs stored score" -m "Never overwrites: stored scores stay immutable per resume version. Bypasses
the cache read, writes the fresh result through. 404/400 paths ownership-
scoped; degraded provider in tests keeps the math deterministic."
```

---

### Task 8: Documentation sync

**Files:**

- Modify: `docs/ats-scoring-technical-design.md` (v1.0 → v1.1)
- Modify: `docs/api-reference.md`, `MVP_STATUS.md`, `TODO_PLAN.md`, `docs/architecture.md`

**Interfaces:** none (docs only). Keep the self-dating header/changelog convention the design doc already uses (§19.4 revision history).

- [ ] **Step 1: Update `docs/ats-scoring-technical-design.md`**

Targeted edits (keep every untouched section as-is):

1. Header table: Version → `1.1`; Change log row → `v1.1 — 2026-09-27 — Keyword phase v2 (synonyms, graded credit, IDF), score cache, rescore endpoint, engineVersion + degraded-flag persistence`.
2. §4.2: after the master formula add: `Engine version: scores are stamped engineVersion=2 (v1 = token-set keyword phase, pre-2026-09). Weights unchanged.`
3. §4.3: replace the method paragraph with the v2 description — graded credit exact 1.0 / synonym 0.9 (shared `skill-matcher.ts` groups) / token-subset 0.75, +0.1 section-spread cap 1.0, optional IDF normalization from the newest ≤500 CanonicalJob descriptions (1h cache; empty corpus → plain weights). Remove the "no synonym handling inside scoring" limitation sentence.
4. §11: add `engineVersion` to the subdocument field list; note the degraded-flag persistence fix; note golden fixtures at `src/tests/fixtures/ats-golden-cases.json` as the v1→v2 delta record (B: 50→95, C: 0→100, A/D unchanged).
5. §12: add row — `POST /resumes/:id/rescore | Re-scores stored content with the current engine; returns stored vs fresh + delta; never overwrites`.
6. §13: replace "No caching of scores" with the cache description (in-process LRU 200 / TTL 1h, key = sha256(resume content, parsedJD, engineVersion), degraded never cached, quick-ats-check only).
7. §18: move "TF-IDF/BM25 keyword phase + synonym sharing", "score caching", "re-score endpoint", and "golden-score regression file" from future/open to implemented (v1.1); keep the calibration study open.
8. §19.4: append the v1.1 revision row.

- [ ] **Step 2: Update `docs/api-reference.md`**

In the Resumes table add:

```markdown
| POST | `/resumes/:id/rescore` | Re-runs the current engine on stored content; returns stored vs fresh + delta; never overwrites |
```

- [ ] **Step 3: Update `MVP_STATUS.md` and `TODO_PLAN.md`**

- `TODO_PLAN.md`: mark Tier 1 #3 `✅ DONE (<date>)`, tick its five checkboxes, and add a one-paragraph "Executed as docs/superpowers/plans/2026-09-27-ats-scoring-upgrade.md" summary (mirror the #1/#2 style). Update the Priority Index row.
- `MVP_STATUS.md`: ATS scoring status 60% → 85%, with the golden-file delta record cited as evidence.

- [ ] **Step 4: Update `docs/architecture.md` verification baseline**

Re-run the numbers (Task 9 produces the final counts) and update the baseline block + test-coverage sentence to include the new suites.

- [ ] **Step 5: Commit**

```bash
git add docs/ats-scoring-technical-design.md docs/api-reference.md MVP_STATUS.md TODO_PLAN.md docs/architecture.md
git commit -m "docs: ATS scoring v1.1 — keyword phase v2, cache, rescore endpoint"
```

---

### Task 9: Full verification gate

**Files:** none (verification only; fix-forward if red).

- [ ] **Step 1: Full gates from the repo root**

```bash
npm run typecheck      # 4/4 tasks
npm run lint           # 3/3 tasks, 0 errors (warnings allowed)
npm run test           # all three suites green
npm run test:coverage --workspace=job-tailor-server   # must stay above the 50/60/60/60 floor
```

Expected: everything green; coverage ≥ floor (was 67.34/69.05/74.17/67.34 at the 2026-09-27 measurement; new suites only add coverage).

- [ ] **Step 2: Hermeticity double-check (F4 invariant from the harness review)**

```bash
cd apps/server
Rename-Item .env .env.check; npx vitest run; Rename-Item .env.check .env
```

Expected: identical pass counts with and without real API keys — the new tests mock at the provider boundary and must not change this.

- [ ] **Step 3: Record final counts in the docs baseline (Task 8 Step 4) if not already exact, then final commit if docs changed**

```bash
git add -A docs README.md SETUP.md
git commit -m "docs: refresh verification baseline after ATS scoring v2"
```

(Skip the commit if nothing changed.)

- [ ] **Step 4: STOP. Do not push.** Pushing triggers the L3 security-review gate and is a separate explicit user decision.

---

## Self-Review (completed at plan-writing time)

**Spec coverage (TODO_PLAN #3):** golden-score regression file first → Task 1 ✓; TF-IDF/BM25 replacement keeping 2×/1× → Tasks 3–5 (graded credit + IDF distinctiveness weighting; BM25-style saturation expressed as graded credit + spread bonus, corpus IDF from CanonicalJob) ✓; share search synonym map → Task 3 via existing `skill-matcher.ts` ✓; score caching keyed on (resume version, parsed JD) hash → Task 6 (key adds engineVersion — a superset of the spec'd key) ✓; re-score endpoint comparing without overwriting → Task 7 ✓. Design-doc §18 open items implemented: golden file, cache, rescore ✓. Latent schema bug (degraded flag not persisted) → Task 2 ✓.

**Placeholder scan:** no TBDs; every code step contains complete code; the two "executor note" items are bounded verification instructions against named files (schema required-fields and error-handling convention), not design gaps.

**Type consistency:** `ResumeContent` exported once (Task 1) and imported type-only by keyword-scorer (Task 3) — no runtime cycle; `ATS_ENGINE_VERSION` defined in ats-scoring.service (Task 5) and imported by controller (Task 6/7) — cache module takes it as a parameter so score-cache has zero imports from scoring; `SkillCredit`/`scoreKeywordsV2`/`computeSkillIdfMap`/`scoreKey`/`scoreCache` signatures identical across Tasks 3–7; golden fixture schema (`v1`/`v2` blocks) consistent between Tasks 1 and 5. Arithmetic for all golden values verified by hand against the frozen formulas (A: 80/73/90→80; B v1 50→v2 95, overall 53→78; C v1 0→v2 100, overall 26→81; D 0/25/60→18).
