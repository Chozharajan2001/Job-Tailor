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

| Rank | Tier      | Feature                                                     | Effort  |
| ---- | --------- | ----------------------------------------------------------- | ------- |
| 0    | Quick Win | Fix stale docs                                              | 30 min  |
| 1    | MUST      | ✅ Live job discovery — seed the empty index                | 8 h     |
| 2    | MUST      | ✅ Chrome Extension — code complete (2 sub-items open)      | 15–20 h |
| 3    | MUST      | ✅ ATS Scoring upgrade (60% → 85%)                          | 8–12 h  |
| 4    | IMPORTANT | Resume template library                                     | 6 h     |
| 5    | IMPORTANT | Cover letter generator                                      | 4 h     |
| 16   | IMPORTANT | ✅ Ghost-listing detection and tagging (shipped 2026-09-30) | 5–7 h   |
| 6    | IMPORTANT | Email digest recommendations                                | 6–8 h   |
| 7    | IMPORTANT | UI onboarding fixes (empty state, progress)                 | 2–3 h   |
| 8    | QUALITY   | Resume tailoring depth                                      | 4–6 h   |
| 9    | QUALITY   | Real ATS emulation (parsable check)                         | 8 h     |
| 10   | QUALITY   | Analytics depth                                             | 4–6 h   |
| 11   | QUALITY   | Testing gaps                                                | 4–6 h   |
| 12   | POLISH    | Kanban DnD, filters, quick preview, loaders                 | 8–12 h  |
| 13   | SHIP      | Production deployment verification                          | 4–6 h   |
| 14   | FUTURE    | Extension v2/v3 (save-job, autofill)                        | 12–24 h |
| 15   | FUTURE    | JobPilot referral agent                                     | 20–30 h |

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

- [ ] **Test gap (H4)** — `savedAt` is asserted through `Job.create` (`tests/job.test.ts:173`) but never through the HTTP `createJob` path; the controller (`controllers/job.controller.ts:14-27`) only persists it because of the schema default. Re-verified 2026-09-30.

- [x] **H6** ✅ Fixed 2026-09-30 — `performSilentRefresh` now runs inside a named Web Lock (`jobtailor:silent-refresh`) with a mutex-only fallback when the API is missing, so a second tab waits instead of replaying a rotated token and tripping reuse detection into revoking all sessions. VerifyEmailPage's auto-retry is capped at 3 attempts.
- [x] **H7** ✅ Fixed 2026-09-30 — `REGISTRATION_MODE` (`open`|`allowlist`|`closed`) + `REGISTRATION_EMAIL_ALLOWLIST`, read per request, gate `POST /auth/register` with 403 `REGISTRATION_CLOSED` / `EMAIL_NOT_ALLOWED` before any user is created; unknown mode fails closed and is rejected at boot. Default stays `open`, so **a deployment must set it** (still a launch checklist item under #13).
- [x] **H8** ✅ Fixed 2026-09-30 — `safeFetchText` no longer resolves twice: `resolveSafeTarget` returns the addresses that passed validation and the request is dialed through `createPinnedLookup`, a `lookup` that can only answer from that set (SNI keeps the original hostname via `servername`), re-pinned per redirect hop and failing closed on an empty set. Transport moved from `globalThis.fetch` to Node's own `http`/`https` (undici is not a dependency), with the 2 MB cap and gzip/deflate/br decoding carried over. Mutation-checked: dropping the pinned lookup fails 2 of 9 tests.
- [x] **H9** ❌ **Retracted 2026-10-05 — the finding was false and no code was changed.** It claimed zustand `persist` was configured without a `partialize`, so `accessToken` was being serialized to localStorage and readable by any XSS. Reading the whole file disproves it: `persist(` is at `stores/authStore.ts:28` and its options block at `:96-102` does define `partialize: (state) => ({ user: state.user, sessionExpired: state.sessionExpired })`, so only the user object and the expiry flag are persisted. The comments at `services/api.ts:34`, `services/api.ts:45` and `stores/authStore.ts:37` are accurate, as is the development-guide checklist. Residual exposure: none. The mistake was an inference of absence from a partial read (the options block sits past the line range that was inspected) — recorded so future audits read configs to their end before claiming an option is missing. One side-finding from that same pass is real and stays: Node 25's native `localStorage` shadows jsdom's and throws unless `--localstorage-file` is set, so client tests must install an in-memory Storage before importing the store (see `apps/client/src/tests/refresh-lock.test.ts`).
- [ ] **M-batch** M1 `trust proxy` config · ~~M2~~ ✅ **Fixed 2026-10-05** — static 5xx bodies in the controllers. The audit listed four echo sites; the real count was **ten**: `search.controller.ts` ingest, `job.controller.ts` JD parse, four in `resume.controller.ts` (generate, PDF, profile-resume create, profile-resume update) and four in `analytics.controller.ts` (click, feedback, dashboard, trust update). The ingest one was the SSRF oracle, and the profile-resume pair leaked Mongoose `Cast to ObjectId … for model "Resume" at path "userId"` with the offending value. `middleware/error-handler.ts:156-164` keeps its dev-only leak on purpose. Pinned by `tests/error-surface.test.ts` (10 cases). · ~~M3~~ ✅ **Fixed 2026-10-05** — `admin-auth.ts` now compares SHA-256 digests with `timingSafeEqual` (no length or first-differing-byte signal), `validateConfig` rejects a set-but-short `<32`-char `SOURCE_POLL_ADMIN_KEY` at boot while unset still boots (routes answer 503), and `/api/v1/admin/*` gained a 10/minute limiter. Pinned by `tests/admin-auth-hardening.test.ts` (7 cases). · ~~M4~~ ❌ **Closed as won't-fix 2026-10-05** — Cloudinary `type: "private"` for raw uploads is only readable through a signed URL (`access_mode` + `res_sig`), and the client does `window.open(pdfUrl)` (`ResumeTailorPage.tsx:114`, `TrackerPage.tsx` likewise), so flipping it without signing breaks every resume download. The signing scheme cannot be verified here — the repo ships only placeholder Cloudinary credentials. Residual risk is a leaked URL for an asset whose `public_id` is already `…_${Date.now()}`-randomized, with no listing endpoint and no `eager` transform. Reopen only as part of serving PDFs through an authenticated endpoint. · ~~M5~~ ✅ **Fixed 2026-10-05** — `/search/feed` was the only list route reading `page`/`limit` through bare `parseInt(...) || default` (`feed.controller.ts:9-10`); it now runs through `validateQuery` with the same bounds as `jobListQuery` (`page ≥ 1`, `1 ≤ limit ≤ 100`, defaults `1`/`20`), so malformed input is a `400 VALIDATION_ERROR` instead of a silent reinterpretation, and an unbounded `limit` can no longer ask for the whole scored set. Stated precisely: pagination happens in memory over an already-scored candidate set (`feed.service.ts:170-171`), so this bounds **response size**, not query cost — the scoring pass is unaffected and remains the real cost driver. Pinned by `tests/feed-query-validation.test.ts` (12 cases; removing `.max(100)` fails exactly one). · ~~M7~~ ✅ **Fixed 2026-10-05** — all six connector `fetch()` sites (`ashby.ts:27`, `greenhouse.ts:48/:67/:106`, `lever.ts:28`, `remoteok.ts:38`) went through `utils/connector-fetch.ts`, which attaches `AbortSignal.timeout(CONNECTOR_TIMEOUT_MS)` (default 10 000, read per call so a deploy can retune). Scope stated honestly: the poller's `errorCount` `$inc` and circuit-breaker threshold already existed and were already tested — they simply never fired, because a stalled connector never rejected. Now it does. Pinned by `tests/connector-timeout.test.ts` (7 cases; the stub honours the signal the way real fetch does, and deleting the `signal` from the helper fails 6 of them). The greenhouse detail path keeps its designed behaviour: an aborted detail skips that job and it is retried on the next poll. · M8 dedup E11000 revival path · M9 `createApplication`/`getOrCreateProfile`/resume-version races · M10 wire gitleaks into pre-push/CI (verified 2026-10-05: `gitleaks.toml` is referenced by no workflow or hook, so no secret scan actually runs) · M11 extension: `storage.local` for key + https-only `apiBase` · M12 detector structural confirm signals
- [ ] **L-batch** Zod on `PUT /jobs/:id` + profile DELETE params · escape `$regex` host in ingestion · admin-gate feedback/click · rollback `Job.status` on application delete · `resumeId` interface nullability · feed URL normalization · extension sourcemap prod policy · pin GH Actions · gitignore `.qoder/`+`.zcode/` · queryKeys drift · `npm audit fix` (3 advisories)

Effort: **H6–H8 shipped 2026-09-30**; **H9 retracted 2026-10-05** (false alarm — the token store already narrows persistence with `partialize`, so it costs nothing); **M2 + M3 shipped and M4 closed 2026-10-05**, leaving M-batch ≈ 5–7 h (M8–M12; M5 and M7 shipped the same day) and L-batch ≈ 4–6 h. The H7 deployment config (`REGISTRATION_MODE` must not stay `open`) is now the only Tier-1.5 prerequisite for Tier 5.

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

**Plan:** `docs/superpowers/plans/2026-09-30-ghost-listing-detection.md` (9 tasks, TDD, with the measured live-payload evidence the design rests on).

**Why this is ranked here:** #1 seeded the index, so search, feeds, alerts and the planned #6 digest now all consume live listings — and our sweep actively _rewards_ ghosts. The cleanup pass pings the apply URL, gets a 200 OK, writes `verified` and **boosts** source trust by +0.01 (`cleanup.service.ts:161`), while every re-poll refreshes `lastSeenAt` and forces `isActive: true` (`ingestion.service.ts:163-169`) — so the 30-day stale cutoff (`cleanup.service.ts:58-79`) can never fire on a listing that is deliberately kept open forever. A months-old evergreen posting is currently the most trusted record we hold, and it costs the user a tailor + an application + weeks of waiting. Ranked above #6 because the digest multiplies whatever noise the index contains. Tier 2 not Tier 1: nothing breaks without it, and a wrong tag must never hide a real job.

**Signals — deterministic, computed from data already stored, no extra fetches, no LLM (the poll-time cost invariant holds). Shipped 2026-09-30 per the implementation plan; see the baseline measurement there (1,235 listings, 45 % older than 60 days by provider `postedDate`):**

- **Sighting span** — anchored on `postedDate ?? firstSeenAt` (provider age, not first-sighting time — a fresh index makes `firstSeenAt` useless). Threshold 60 d, 45 d for contract/internship.
- **Repost churn** — `findDuplicate` L2/L3 only match `isActive: true` (`deduplication.service.ts:54-72`), so a role re-posted after the previous record lapsed already lands as a second row with the same `(companyName, jobTitle, location)`. Countable through the existing compound index. Accruing signal: zero on day one, measured on every later sweep.
- **Evergreen copy** — regex on title/description: "always hiring", "ongoing pipeline", "we review continuously", rolling start dates.
- **Unchanged text** — `descriptionHashChanges === 0` **and** an actual re-sighting happened; never fires on a first sighting (a 0 counter with no history is not evidence).
- **Cross-source absence** — _deferred_: not part of the shipped scorer (the role appears on one source while sibling roles appear on two or more); revisit if repost churn proves too sparse.

**Prerequisite — ingestion correctness. ✅ DONE.** The duplicate branch now writes the incoming `description` + `descriptionHash` and increments `descriptionHashChanges` on every changed re-sighting (`ingestion.service.ts:163-179`), so drift is countable and the "unchanged" signal is honest. `salaryRange` persistence remains open (new rows still store `salaryRange: undefined`).

- [x] **Measure before weighting** — `apps/server/src/scripts/ghost-baseline.ts` over the seeded live index: 1,235 active listings; 555 (45 %) older than 60 days, 269 older than 120, by provider `postedDate`; 18 evergreen hits; repost churn and drift zero on day one (recorded in the plan's Baseline Measurement section).
- [x] **Golden regression file first** — `apps/server/src/tests/fixtures/ghost-golden-cases.json`, 7 hand-computed cases; weights are mutation-checked (span 0.45 → 0.5 fails 5 of 7).
- [x] `apps/server/src/services/ghost-job.service.ts` — pure `scoreGhostSignals(job, context) → { risk: 0–1, reasons: string[] }`, no DB writes, no LLM; plus `applyGhostScoring()` driven from the daily sweep (`jobs/stale-cleanup.job.ts`, cron 03:00) **after** the link check so only live listings get scored.
- [x] Fields on `CanonicalJob.model.ts` **and** `packages/shared-types`: `ghostRisk`, `ghostReasons: [String]`, `ghostEvaluatedAt`, `descriptionHashChanges`, `userGhostVerdict`.
- [x] Do **not** widen the `verificationState` enum — the sweep never touches `isActive`/`verificationState` (pinned by test). A ghost tag demotes; it never deletes.
- [x] Ranking only — relevance multiplied by `(1 − 0.5 × ghostRisk)` in search and feed; tagged listings stay reachable. Opt-in `hideGhosts=true` filter hides risk ≥ 0.6 and never untagged rows.
- [x] **User override wins** — `POST /api/v1/search/feedback` accepts `still_hiring`; `userGhostVerdict: 'real'` pins the risk at 0 and is honored by feed and by #6.
- [x] UI — amber chip with the server's reasons verbatim in both `JobsPage.tsx` result lists and the job-detail modal, a "still hiring?" dispute button, the "Hide likely stale" search toggle, and a per-source "Likely stale" column on the Quality Dashboard tab.
- [x] Docs — `docs/api-reference.md` documents the feedback enum, the new `CanonicalJob` fields and `hideGhosts`; the shared verification baseline is re-measured.

**Honest limits:** this cannot prove a listing is fake. Connectors give us no usable close date — Greenhouse exposes `application_deadline`, but it was `null` on all 9 live postings sampled on 2026-09-30, and its `updated_at` is identical across every job on a board, so neither can inform the score; `first_published` and sighting span are what we actually have. We get no employer intent, and one user's outcome history is a tiny sample. It ships as an advisory tag with visible reasons — anything stronger would be a fabricated claim. **Depends on:** #1 (done). Independent of H6–H8. **Feeds:** #6 (candidate list), #10 (per-source ghost rate), #15 (do not chase referrals on dead listings).

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

**UI audit 2026-10-05 (measured in Chromium, `http://localhost`, widths 375 / 768 / 1440):**

- ✅ **C-1 responsive shell — fixed.** Before: at 375 px the fixed `w-64` sidebar took **68 %** of the viewport and left `<main>` **119 px** wide while its own content needed 298 px (tracker) / 239 px (dashboard); `min-width` on `<main>` was `auto`, and there was no way to hide the nav. Now the nav is an off-canvas drawer below `md` (toggle 36×36 px with `aria-label`/`aria-expanded`/`aria-controls`, backdrop, Escape closes and returns focus, navigation closes it, and the closed drawer is `inert` + `aria-hidden` so it cannot be tabbed into). Measured after: `<main>` **375 px**, `scrollWidth` 361 px, no overflow; 768 px and 1440 px unchanged (sidebar static, 256 px). Pinned by `apps/client/src/tests/layout-drawer.test.tsx` (8 cases).
- [~] **C-2 keyboard and screen-reader path — step 3 of 3 shipped, steps 1–2 sequenced behind the monolith split.** Measured: each tracker card renders **two buttons with no accessible name**, sized **20×20 px** (under 24×24 and far under 44×44); the card detail overlay carries **no `role="dialog"` / `aria-modal`**, focus never leaves `<body>`, and **Escape does nothing**. There are **eleven** hand-rolled overlays, not one: `CreateApplicationModal.tsx:107`, `ProfileUploadModal.tsx:111`, `ResumeUploadModal.tsx:79`, `SessionExpiredModal.tsx:70`, `TrackerPage.tsx:625`, and six in `JobsPage.tsx` (`:1882, :2001, :2102, :2595, :2899, :3029`).
  - ✅ **Shipped 2026-10-05:** the only `window.confirm` in the client (`TrackerPage.tsx:385`) now routes through the existing `ConfirmDialog`. Verified in Chromium: `role="dialog"`, `aria-modal="true"`, accessible name "Delete this application?", focus lands on _Cancel_ inside the dialog, the detail modal stays mounted behind it, **Escape dismisses without deleting**, and confirming actually removes the row. Pinned by `tests/tracker-delete-dialog.test.tsx` (3 cases, red first).
  - [ ] **Next, in this order:** split `JobsPage.tsx` (3167 lines) → then convert all eleven overlays to one shared dialog built on **`@radix-ui/react-dialog`**. That package is a dependency decision, and it is a real one: `@radix-ui/react-alert-dialog` (already installed) is the _confirmation_ primitive and is the wrong shape for the detail view and the upload/create forms. Native `<dialog>` + `showModal()` was considered and rejected for this step — its semantics cannot be asserted in jsdom, so eleven conversions would be proven only by hand.
  - Two nits measured while verifying, to fix during the conversion: `ConfirmDialog.tsx:27` sets `role="dialog"` explicitly, which downgrades Radix's more accurate `alertdialog`; its action buttons are **75×37 and 73×37 px**, so they clear WCAG 2.5.8 (24×24) but not 2.5.5 (44×44).
  - Do **not** add a live region to the tracker — it already has one (`role="status"`).
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
Sprint E:  16 (ghost tagging ✅ shipped) + 7 (onboarding)  → 2–3 h   ← index quality before reach
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
16 (ghost tag)  → needs 1 (done); PREREQ ingestion drift fix ✅ done; 16 itself ✅ shipped 2026-09-30;
                  reuses stale-cleanup job + search/feed ranking; GATES 6
6 (digest)      → BLOCKED BY 1; consumes 16 tags, honors userGhostVerdict
7 (onboarding)  → independent
8–12            → independent, parallelizable
13 (deploy)     → after features stabilize
14 (ext v2/v3)  → builds on 2
15 (JobPilot)   → depends on 1 + 2; should skip 16 high-risk listings
```
