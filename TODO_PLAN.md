# JobTailor — Prioritized TODO Plan

> Last updated: 2026-09-29 (added #16 ghost-listing detection to Tier 2 above #6; ingestion drift fix recorded as its prerequisite; index, sprints and dependency map re-sequenced)
> Prior note: Tier 1 complete; security-audit remediation tier added.
> Source: post-audit of MVP status, sprint checklists (1–6), feature gaps, and competitor analysis (Teal, Huntr, Jobscan, Simplify, RemoteHunt, Happpy Agent/Uplers, LoopCV, AIHawk).
> Ordering principle: **must-have before nice-to-have; product viability before polish.**

---

## How To Read This

| Tier                         | Meaning                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------- |
| **TIER 1 — MUST HAVE**       | The product is meaningfully broken or worthless without these. Do first.     |
| **TIER 2 — IMPORTANT**       | Competitive parity and the biggest value-adds. Rivals monetize these.        |
| **TIER 3 — QUALITY & DEPTH** | Makes good features great. Valuable but nothing breaks without them.         |
| **TIER 4 — POLISH**          | Usability and surface improvements.                                          |
| **TIER 5 — SHIP**            | Production readiness.                                                        |
| **TIER 6 — FUTURE**          | New product tracks, built on the foundation above.                           |
| **QUICK WIN**                | Trivial effort, pulled out of tier ordering because it costs almost nothing. |

Item numbers are stable IDs assigned when the item was created, not ranks — so the
Priority Index stays readable after re-ordering. Row order in that table, and the
sprint order in **Execution Order**, carry the actual priority.

---

## Priority Index (single glance)

| Rank | Tier      | Feature                                                | Effort  |
| ---- | --------- | ------------------------------------------------------ | ------- |
| 0    | Quick Win | Fix stale docs                                         | 30 min  |
| 1    | MUST      | ✅ Live job discovery — seed the empty index           | 8 h     |
| 2    | MUST      | ✅ Chrome Extension — code complete (2 sub-items open) | 15–20 h |
| 3    | MUST      | ✅ ATS Scoring upgrade (60% → 85%)                     | 8–12 h  |
| 4    | IMPORTANT | Resume template library                                | 6 h     |
| 5    | IMPORTANT | Cover letter generator                                 | 4 h     |
| 16   | IMPORTANT | Ghost-listing detection and tagging                    | 5–7 h   |
| 6    | IMPORTANT | Email digest recommendations                           | 6–8 h   |
| 7    | IMPORTANT | UI onboarding fixes (empty state, progress)            | 2–3 h   |
| 8    | QUALITY   | Resume tailoring depth                                 | 4–6 h   |
| 9    | QUALITY   | Real ATS emulation (parsable check)                    | 8 h     |
| 10   | QUALITY   | Analytics depth                                        | 4–6 h   |
| 11   | QUALITY   | Testing gaps                                           | 4–6 h   |
| 12   | POLISH    | Kanban DnD, filters, quick preview, loaders            | 8–12 h  |
| 13   | SHIP      | Production deployment verification                     | 4–6 h   |
| 14   | FUTURE    | Extension v2/v3 (save-job, autofill)                   | 12–24 h |
| 15   | FUTURE    | JobPilot referral agent                                | 20–30 h |

---

# TIER 0 — QUICK WIN (do immediately, costs nothing)

### 0. Fix Stale & Misleading Docs — 30 min ✅ DONE (2026-09-25)

Not important by value, but it is 30 minutes and the current state actively misrepresents the project.

- [x] Update `README.md` — test count (9 files, 50+ tests), phases 5–9 status, PDF export is wired
- [x] Update `docs/architecture.md` — remove outdated claims ("no tests", "PDF route pending", "fallback score of 75")

---

# TIER 1 — MUST HAVE

_Without these, the product's core promise does not hold. Ordered by severity of the gap._

---

## 1. Live Job Discovery — Seed the Empty Index (8 h) ✅ DONE (2026-09-26)

**Why this is #1:** the search engine is best-in-class but `CanonicalJob` starts **empty at signup**. Every search, feed, watch, alert, and future digest returns nothing. A new user's first impression is a dead product. RemoteHunt, Jobright, and Teal hook users with live listings on day one — this is the single largest gap between what we built and what anyone can use.

Every other discovery feature depends on this. Nothing downstream works on an empty index.

**Executed as `docs/superpowers/plans/2026-09-26-live-job-discovery.md` (14 tasks).** 4 API connectors (Greenhouse, Lever, Ashby, RemoteOK), poller service with concurrency cap + circuit breaker + trust decay via existing `CleanupService`, admin surface gated by `x-admin-key` with Zod companyId validation, 23-item seed JSON + CLI bootstrap, GitHub Action cron. `IngestionService.ingestJob` widened to accept `api_connector` sourceType with a fast path that skips the LLM. E2E smoke covers seed → poll → search. 40 new server tests added (suite 77 → 117).

- [x] Connectors for public career-page APIs — Greenhouse, Lever, Ashby all expose public JSON job feeds per company
- [x] RSS feed ingestion for job boards — implemented via the RemoteOK firehose connector
- [x] Open remote-job APIs (RemoteOK-style)
- [x] Scheduled crawl runner — reuse existing ingestion pipeline, dedup (L1/L2/L3), and source trust scoring
- [x] Source registry entries + sensible trust defaults per connector type
- [x] Verify the existing search/feed/alert pipeline returns real results end-to-end against seeded data

---

## 2. Chrome Extension — Auto-Track Applications (15–20 h) ✅ CODE COMPLETE (2026-09-27) — 2 open sub-items below

**Why this is #2:** the tracker only has value if applications actually land in it. Today that requires the user to remember to add each one manually — the single biggest reason tracking tools get abandoned. This makes the tracker **self-fill**, which compounds the value of analytics, outcomes, interview mode, and everything already built.

**Loop:** user applies on a job platform → extension detects the submission → popup asks "Add this to JobTailor tracker?" → `POST /applications/from-extension` → appears on the Kanban board.

**Executed as `docs/superpowers/plans/2026-09-26-chrome-extension-auto-track.md` (17 tasks).** Per-user revocable API keys (`jtk_…`, hashed at rest) with JWT-protected issue/list/revoke; idempotent upsert endpoint (jobLink → company+title/60d → create; `(userId, jobId)` unique index prevents dupes); MV3 extension with platform registry, 4 detector+extractor pairs on synthetic-fixture tests (incl. script-injection resistance), confirm-by-default popup, options page with always-add opt-in and a 401-vs-400 connection probe. 27 new tests; extension is loadable from `apps/extension/dist`.

- [x] Extension scaffold — Manifest V3, content scripts, background service worker, auth with JobTailor server (new `apps/extension/` package)
- [x] Platform detectors — Greenhouse, Lever, Ashby, Workday (URL pattern + DOM signature per platform). **LinkedIn + SmartRecruiters: deliberate v1 non-goals** (ToS/modal complexity; tenant-variable DOM) → moved under v2
- [x] Application submission detection — confirmation pages, "thank you" screens, SPA route changes via MutationObserver + popstate/hashchange
- [x] Job data extraction — company, title, JD text, URL from page DOM (Ashby blob read as text, never executed)
- [x] Popup UI — job preview card + "Add to JobTailor" / "Skip"; textContent-only rendering
- [x] API bridge — `POST /applications/from-extension` with x-api-key auth, `{ platform, sourceUrl, companyName, jobTitle, jdRawText, detectedAt }`
- [x] Match detection — URL first, company+title within 60 days second; re-fires never duplicate
- [x] Settings page — API key + URL, per-platform tracked/always-add toggles, connection probe
- [ ] Manual real-DOM verification: load `dist/` unpacked, apply to a live posting on each platform (fixtures pin our assumptions, not their DOMs)
- [ ] Web UI affordance: a "Settings → API keys" section in the JobTailor client to generate keys without curl. **Supported path until this ships:** issue/list/revoke keys with curl (or any HTTP client) against the JWT-protected `/api/v1/apikeys` endpoints — `POST /api/v1/apikeys` returns the raw `jtk_…` key exactly once

---

## 3. ATS Scoring Upgrade — 60% → 85% (8–12 h) ✅ DONE (2026-09-27)

**Why this is #3:** this is the weakest feature in the core loop and the core loop's whole premise is "know how well you match before you apply." A weak score undermines every downstream decision — tailoring, comparison, analytics cohorts.

**Executed as `docs/superpowers/plans/2026-09-27-ats-scoring-upgrade.md` (9 tasks).** Golden-score regression file pinned v1 first; keyword phase v2 = synonym-aware graded credit (exact 1.0 / synonym 0.9 / token-subset 0.75 + section-spread bonus) reusing the search feature's `skill-matcher.ts`, with IDF distinctiveness weighting from the CanonicalJob corpus (graceful empty-corpus degeneration). Recorded deltas: "TS"→TypeScript 50→95, "SRE"→Site Reliability 0→100, exact-match cases unchanged. In-process score cache (LRU 200 / TTL 1h, engine-version-keyed, degraded never cached) on quick-ats-check; `POST /resumes/:id/rescore` compares without overwriting. Latent bug fixed: `semanticScoreDegraded` was never persisted (missing from the Mongoose schema). Weights and the never-fabricate degraded policy untouched.

- [x] **Golden-score regression file first** — safety net before touching any formula (`ats-golden-cases.json`, 4 cases, v1→v2 deltas recorded)
- [x] Replace token-set keyword match with TF-IDF/BM25 — delivered as graded credit + corpus IDF (required 2× / preferred 1× weights kept)
- [x] Share the search synonym map into scoring — `skill-matcher.ts` now used by search, alerts, AND scoring
- [x] Score caching keyed on (resume version, parsed JD) hash — key also includes engine version
- [x] Re-score endpoint — `POST /resumes/:id/rescore` compares new engine output against stored versions without overwriting

---

# TIER 1.5 — SECURITY (full-app audit 2026-09-27, remediation in progress)

_Four parallel read-only domain audits. H1–H5 fixed and test-pinned 2026-09-27; the rest are ranked open items. Evidence: `MVP_STATUS.md` § Security Audit._

**Fixed:** H1 log redaction of `x-api-key`/`x-admin-key` · H2 key revocation on password change/reset + deactivated-owner refusal · H3 Greenhouse content enrichment + zero-ingested = source failure · H4 `Job.savedAt` persistence · H5 job-delete cascade.

- [ ] **H6** Cross-tab silent-refresh race → token-reuse detection revokes ALL sessions (`navigator.locks` around `performSilentRefresh`); also the VerifyEmailPage infinite retry loop (M6)
- [ ] **H7** Public self-registration in front of paid AI endpoints — env allowlist/invite gate. **Blocking requirement before any deploy**
- [ ] **H8** SSRF DNS-rebinding TOCTOU: pin the validated IP for the actual connection; drop the ad-hoc `startsWith` filter in cleanup for the guard
- [ ] **M-batch** M1 `trust proxy` config · M2 static 5xx messages (stop error echoes / SSRF oracle) · M3 admin key length check + timing-safe compare + limiter · M4 Cloudinary `type:private`/random public_id · M5 `/search/feed` validateQuery + bounds · M7 connector fetch timeouts · M8 dedup E11000 revival path · M9 `createApplication`/`getOrCreateProfile`/resume-version races · M10 wire gitleaks into pre-push/CI · M11 extension: `storage.local` for key + https-only `apiBase` · M12 detector structural confirm signals
- [ ] **L-batch** Zod on `PUT /jobs/:id` + profile DELETE params · escape `$regex` host in ingestion · admin-gate feedback/click · rollback `Job.status` on application delete · `resumeId` interface nullability · feed URL normalization · extension sourcemap prod policy · pin GH Actions · gitignore `.qoder/`+`.zcode/` · queryKeys drift · `npm audit fix` (3 advisories)

Effort: H-batch ≈ 6–8 h, M-batch ≈ 10–14 h, L-batch ≈ 4–6 h. Do H6–H8 **before** Tier 5 deployment work.

---

# TIER 2 — IMPORTANT (competitive parity, high value per hour)

_Nothing is broken without these, but every serious competitor has them._

---

## 4. Resume Template Library (6 h)

**Why:** our PDF output is one plain template. Rezi/Teal/Jobscan win on how the resume _looks_, and a user's perception of product quality is set by the artifact they actually send out. This is the cheapest visible quality upgrade.

- [ ] 3–5 professional Puppeteer HTML templates
- [ ] Theme/template picker on the tailor page, stored per resume version
- [ ] Template applied to existing PDF export path

---

## 5. Cover Letter Generator (4 h)

**Why:** the cheapest big win in the whole plan. Reuses the JD parse + tailoring engine + LLM stack that already exist — no new infrastructure. Teal, Jobscan, and AIHawk all monetize this.

- [ ] `POST /applications/:id/cover-letter` — profile + parsedJD → tailored letter, truth-bounded (no fabricated claims, same rule as summary rewrite)
- [ ] Store on Application, editable inline
- [ ] Export as PDF via the template engine from #4

---

## 16. Ghost-Listing Detection and Tagging (5–7 h)

**Why this is ranked here:** #1 seeded the index, so search, feeds, alerts and the planned #6 digest now all consume live listings — and our sweep actively _rewards_ ghosts. The cleanup pass pings the apply URL, gets a 200 OK, writes `verified` and **boosts** source trust by +0.01 (`cleanup.service.ts:161`), while every re-poll refreshes `lastSeenAt` and forces `isActive: true` (`ingestion.service.ts:160-169`) — so the 30-day stale cutoff (`cleanup.service.ts:58-79`) can never fire on a listing that is deliberately kept open forever. A months-old evergreen posting is currently the most trusted record we hold, and it costs the user a tailor + an application + weeks of waiting. Ranked above #6 because the digest multiplies whatever noise the index contains. Tier 2 not Tier 1: nothing breaks without it, and a wrong tag must never hide a real job.

**Signals — deterministic, computed from data already stored, no extra fetches, no LLM (the poll-time cost invariant holds):**

- **Sighting span** — `lastSeenAt − firstSeenAt` while `isActive`; both fields exist today (`CanonicalJob.model.ts:86-87`). Default threshold 60 d, 45 d for contract/internship.
- **Repost churn** — `findDuplicate` L2/L3 only match `isActive: true` (`deduplication.service.ts:59-75`), so a role re-posted after the previous record lapsed already lands as a second row with the same `(companyName, jobTitle, location)`. Countable through the existing compound index (`CanonicalJob.model.ts:106`). Strongest signal available, and invisible in the UI today.
- **Evergreen copy** — regex on title/description: "always hiring", "ongoing pipeline", "we review continuously", rolling start dates.
- **Cross-source absence** — the role appears on one source while sibling roles at that company appear on two or more.

**Prerequisite — ingestion correctness, not optional.** The duplicate branch never writes the incoming `description`, `descriptionHash` or `salaryRange` (`ingestion.service.ts:160-169`), and new rows store `salaryRange: undefined` (`ingestion.service.ts:195`). Stored text is therefore frozen at first sight: content drift is undetectable and salary is unusable as a corroborator. Fix it first — compare incoming vs stored hash in that branch, count changes, refresh the text — then treat "unchanged across ≥3 re-sightings" as a signal rather than an artifact.

- [ ] **Measure before weighting** — one-off script over the current index: age distribution of active listings, repost-churn counts per `(company, title, location)`, how many listings trip each signal. No ghost-rate baseline exists yet; do not pick weights before those numbers are in hand.
- [ ] **Golden regression file first** — `apps/server/src/tests/fixtures/ghost-golden-cases.json` with hand-computed expected risk per signal and per combination, verified against the pre-tagging engine.
- [ ] `apps/server/src/services/ghost-job.service.ts` — pure `scoreGhostSignals(job, context) → { risk: 0–1, reasons: string[] }`, no DB writes, no LLM; driven from the existing daily sweep (`jobs/stale-cleanup.job.ts`, cron 03:00) **after** the link check so only live-and-old listings get scored.
- [ ] Fields on `CanonicalJob.model.ts` **and** `packages/shared-types` (strict mode strips otherwise): `ghostRisk`, `ghostReasons: [String]`, `ghostEvaluatedAt`, `descriptionHashChanges`, `userGhostVerdict`.
- [ ] Do **not** widen the `verificationState` enum — `failed`/`suspicious` are hard-excluded at `search.service.ts:47` and `feed.service.ts:49`. A ghost tag demotes; it never deletes.
- [ ] Ranking only — multiply relevance by `(1 − 0.5 × ghostRisk)` in search/feed ordering; tagged listings stay reachable by direct search.
- [ ] **User override wins** — extend the existing `POST /api/v1/search/feedback` enum (`routes/search.routes.ts:137-140`, today `flag_expired | flag_spam`) with a "still hiring" verdict; `userGhostVerdict: 'real'` pins the risk and is honored by feed and by #6.
- [ ] UI — amber "open 90+ days · unchanged" chip with reason tooltip in `JobsPage.tsx` results and the job detail view, a "hide likely ghosts" filter toggle, and per-source ghost counts on the existing Quality Dashboard tab.
- [ ] Docs — `docs/api-reference.md` for the feedback enum change, plus the shared verification baseline.

**Honest limits:** this cannot prove a listing is fake. Connectors expose no close date, we get no employer intent, and one user's outcome history is a tiny sample. It ships as an advisory tag with visible reasons — anything stronger would be a fabricated claim. **Depends on:** #1 (done). Independent of H6–H8. **Feeds:** #6 (candidate list), #10 (per-source ghost rate), #15 (do not chase referrals on dead listings).

---

## 6. Email Digest Recommendations (6–8 h)

**Why:** turns the product from "open the app and search" into "jobs arrive to you." Builds directly on Tier 1 #1 (needs a populated index) and reuses `FeedService` + `email.service.ts`.

- [ ] User preference model — `emailDigest: { enabled, frequency: 'daily' | 'weekly' | 'off', lastSent }` on User
- [ ] Recommendation engine — reuse `FeedService` ranking (skills + watches → top 5–10 jobs)
- [ ] HTML digest template — job cards: title, company, match %, seniority, link into the app
- [ ] Scheduler/cron — daily 9 AM / weekly Monday 9 AM (node-cron or Render/GitHub scheduled workflow)
- [ ] Dedup — `digestHistory` per user; skip jobs already sent, applied to, or tracker-excluded
- [ ] Candidate quality — skip high-`ghostRisk` listings from #16 unless the user overrode the verdict
- [ ] Preference UI + unsubscribe link in footer

---

## 7. UI Onboarding Fixes (2–3 h)

**Why:** first-session friction is the cheapest churn to fix. These were the P0 items in `AWKWARD_UI_PATTERNS.md` and remain untouched.

- [ ] Dashboard empty state — guided 3-step onboarding with links (Add job → Paste JD → Generate resume)
- [ ] Profile page — completion progress widget (bar + per-section checkmarks)
- [ ] Resume selection — group by type (job-specific vs profile) with clear labels in CreateApplicationModal

---

# TIER 3 — QUALITY & DEPTH

_Makes good features great. Nothing breaks without them._

---

## 8. Resume Tailoring Depth — 85% → 95% (4–6 h)

- [ ] Deeper skill relevance weighting — score each profile skill by JD overlap (exact + synonym + seniority), not just the highlight flag
- [ ] Experience bullet ranking by semantic fit to JD requirements, not just frontend/backend tag match

---

## 9. Real ATS Emulation — Parsability Check (8 h)

**Why:** Jobscan's differentiator. Turns our score from "keyword-matched" to "verified machine-readable" — a genuinely stronger claim.

- [ ] Parse our exported PDF back through a text extractor the way Workday/Greenhouse do
- [ ] Verify each section, heading, and skill survives machine extraction
- [ ] Surface "verified parsable" alongside the score; flag anything a real parser would lose

---

## 10. Analytics Depth — 75% → 90% (4–6 h)

- [ ] Time-series views — applications per week, interview rate trend, score distribution over time
- [ ] Cohort analysis — score bands (0–49 / 50–74 / 75+) vs interview rate per band
- [ ] KPI tooltips — what the metric means, benchmark range, actionable tip

---

## 11. Testing Gaps (4–6 h)

- [ ] Edge-case crawler failure tests — timeout, 403, empty HTML, SPA with no content, redirect loops
- [ ] AI provider adapter unit tests — completion/structured-output mapping, error normalization, fallback chain
- [ ] E2E smoke tests (Playwright) — login → create job → parse JD → generate resume → create application → track outcome

---

# TIER 4 — POLISH

_Usability improvements. Worth doing, worth deferring._

---

## 12. UI Polish P1–P3 (8–12 h)

- [ ] Kanban drag-and-drop (`@dnd-kit/core`) or redesign away from the drag metaphor
- [ ] Quick ATS preview button on ResumeTailorPage (score before full generation)
- [ ] Job list filter/search bar (text + status + sort)
- [ ] Standardize loading states — skeletons for page load, spinners for API calls, progress for PDF generation

---

# TIER 5 — SHIP

---

## 13. Production Deployment Verification (4–6 h)

- [ ] Verify Vercel (client) + Render (server) + MongoDB Atlas end-to-end: register → profile → job → parse → tailor → apply → track
- [ ] Environment variable audit & secrets rotation
- [ ] Confirm the Tier 1 crawl runner and Tier 2 scheduler have a home in production (Render cron / GH Actions schedule)

---

# TIER 6 — FUTURE TRACKS

_New product dimensions. Deliberately last — they consume the foundation above._

---

## 14. Extension Growth Path (12–24 h)

- [ ] **v2 — One-click save job** from LinkedIn/Indeed/board pages → auto-ingest into our search pipeline (Teal's #1 retention feature; ~12 h)
- [ ] **v3 — Form autofill** from master profile across application sites (Simplify's entire moat; ~20 h)
- [ ] **v3 — AI answers to open-ended questions** ("Why this company?") — reuses profile + parsedJD (~4 h)

---

## 15. JobPilot Agent — Track 2: Discover + Refer (20–30 h)

Two independent tracks exist: **Track 1 = Apply & Track** (built), **Track 2 = Discover + Refer** (this). For any job found in the search gateway the user can apply manually, ask the agent to find referrals, or both. Happpy Agent (Uplers) proves the demand — referrals are the highest-conversion channel, and our parsedJD already carries the matching data.

- [ ] Connection pool model — `ReferralContact`; LinkedIn CSV import + manual contacts + past outreach history
- [ ] LinkedIn profile import/review — doubles as fast onboarding and connection-pool seeding
- [ ] Referral finder — match connections to job company/role from parsedJD, rank by relevance (same team, shared background, prior success)
- [ ] Outreach composer — profile + JD → personalized 2-sentence pitch, attach tailored resume PDF; user approves before send
- [ ] Gmail OAuth — draft + send + monitor replies (LinkedIn messaging stays manual, ToS risk)
- [ ] Conversation state machine — classify replies (positive/negative/question), auto-answer from profile, follow-up sequences
- [ ] Referral tracking — `ReferralOutreach` + `OutreachThread`; status separate from Application, optionally linked; email open/click tracking on outreach

**Depends on:** #1 live index (knows what jobs exist) and #2 extension (knows where the user already applied).

---

# Deliberately NOT Doing

Recorded so it reads as a decision, not an oversight. Matches the MVP scope call in `MVP_STATUS.md`.

- **Bulk auto-apply** (LazyApply / AIHawk / LoopCV) — ban risk, poor response rates, contradicts the tailored-fit philosophy
- **Mobile app** — desktop web only for a single-user personal tool
- **Multi-user / team / enterprise** — out of scope by design
- **Auto-deleting or hard-filtering "ghost" listings** (#16) — no ground truth for employer intent, so the verdict stays advisory: tag, demote, let the user override. Silently hiding a real job is a worse failure than showing a stale one

---

# What We're Already Ahead On

Worth stating plainly, from the competitor comparison:

| Capability                                                      | Position                                       |
| --------------------------------------------------------------- | ---------------------------------------------- |
| Outcome recording (callback / rejection / offer)                | ❌ rare among competitors — **we have it**     |
| JD paste → AI structured parse                                  | ❌ almost nobody does paste-parse — **unique** |
| Source trust scoring + link-health verification + auto-cleanup  | ❌ **unique to us**                            |
| Analytics depth (rates, resume-version performance, skill gaps) | **deeper than Teal/Huntr**                     |
| Interview mode (split-screen JD vs resume)                      | ❌ **unique**                                  |
| Multi-provider AI with fallback (OpenAI / Gemini / NVIDIA)      | ❌ most are single-provider — **unique**       |
| Self-hosted, open-source, full data ownership                   | Only AIHawk                                    |

---

# Execution Order

```
Sprint A:  0 (docs) + 1 (live index)            → 8–9 h    ← product becomes usable
Sprint B:  2 (extension auto-track)             → 15–20 h  ← tracker self-fills
Sprint C:  3 (ATS scoring)                      → 8–12 h   ← core promise strengthens
Sprint D:  4 (templates) + 5 (cover letter)     → 10 h     ← visible output quality
Sprint E:  16 (ghost tagging) + 7 (onboarding)  → 7–10 h   ← index quality before reach
Sprint F:  6 (digest) + 8 (tailoring depth)     → 10–14 h  ← proactive delivery
Sprint G:  9 (emulation) + 10 (analytics)       → 12–14 h  ← depth
Sprint H:  11 (tests) + 12 (polish)             → 12–18 h  ← quality
Sprint I:  13 (deployment)                      → 4–6 h    ← live (H6–H8 first)
Later:     14 (extension v2/v3), 15 (JobPilot)  → 32–54 h  ← new tracks
```

## Dependency Map

```
1 (live index)  → nothing upstream; BLOCKS 6 (digest) and 15 (JobPilot)
2 (extension)   → independent; FEEDS 15 (knows where user applied)
3 (ATS)         → golden tests before formula changes
4 (templates)   → FEEDS 5 (cover letter export uses same engine)
5 (cover letter)→ reuses JD parse + tailoring (already built)
16 (ghost tag)  → needs 1 (done); PREREQ ingestion drift fix (ingestion.service.ts:160-169);
                  reuses stale-cleanup job + search/feed ranking; GATES 6
6 (digest)      → BLOCKED BY 1; consumes 16 tags, honors userGhostVerdict
7 (onboarding)  → independent
8–12            → independent, parallelizable
13 (deploy)     → after features stabilize
14 (ext v2/v3)  → builds on 2
15 (JobPilot)   → depends on 1 + 2; should skip 16 high-risk listings
```
