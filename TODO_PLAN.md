# JobTailor — Prioritized TODO Plan

> Last updated: 2026-09-25
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

---

## Priority Index (single glance)

| Rank | Tier      | Feature                                      | Effort  |
| ---- | --------- | -------------------------------------------- | ------- |
| 0    | Quick Win | Fix stale docs                               | 30 min  |
| 1    | MUST      | ✅ Live job discovery — seed the empty index | 8 h     |
| 2    | MUST      | Chrome Extension — auto-track applications   | 15–20 h |
| 3    | MUST      | ATS Scoring upgrade (60% → 85%)              | 8–12 h  |
| 4    | IMPORTANT | Resume template library                      | 6 h     |
| 5    | IMPORTANT | Cover letter generator                       | 4 h     |
| 6    | IMPORTANT | Email digest recommendations                 | 6–8 h   |
| 7    | IMPORTANT | UI onboarding fixes (empty state, progress)  | 2–3 h   |
| 8    | QUALITY   | Resume tailoring depth                       | 4–6 h   |
| 9    | QUALITY   | Real ATS emulation (parsable check)          | 8 h     |
| 10   | QUALITY   | Analytics depth                              | 4–6 h   |
| 11   | QUALITY   | Testing gaps                                 | 4–6 h   |
| 12   | POLISH    | Kanban DnD, filters, quick preview, loaders  | 8–12 h  |
| 13   | SHIP      | Production deployment verification           | 4–6 h   |
| 14   | FUTURE    | Extension v2/v3 (save-job, autofill)         | 12–24 h |
| 15   | FUTURE    | JobPilot referral agent                      | 20–30 h |

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

## 2. Chrome Extension — Auto-Track Applications (15–20 h)

**Why this is #2:** the tracker only has value if applications actually land in it. Today that requires the user to remember to add each one manually — the single biggest reason tracking tools get abandoned. This makes the tracker **self-fill**, which compounds the value of analytics, outcomes, interview mode, and everything already built.

**Loop:** user applies on a job platform → extension detects the submission → popup asks "Add this to JobTailor tracker?" → `POST /applications` → appears on the Kanban board.

- [ ] Extension scaffold — Manifest V3, content scripts, background service worker, auth with JobTailor server (new `apps/extension/` package)
- [ ] Platform detectors — LinkedIn Jobs, Greenhouse, Lever, Workday, Ashby, SmartRecruiters (URL pattern + DOM signature per platform)
- [ ] Application submission detection — confirmation pages, "thank you" screens, submit events, `/success` URL changes
- [ ] Job data extraction — company, title, JD text, URL, location from page DOM
- [ ] Popup UI — job preview card + "Add to tracker" / "Skip" / "Always add from this site"
- [ ] API bridge — `POST /applications` with `{ company, title, jdRawText, url, status: 'applied', appliedAt }` (new extension-auth endpoint)
- [ ] Match detection — if the job already exists (URL or company+title), link to the existing record instead of duplicating
- [ ] Settings page — enable/disable per platform, auto-add without asking

---

## 3. ATS Scoring Upgrade — 60% → 85% (8–12 h)

**Why this is #3:** this is the weakest feature in the core loop and the core loop's whole premise is "know how well you match before you apply." A weak score undermines every downstream decision — tailoring, comparison, analytics cohorts.

- [ ] **Golden-score regression file first** — safety net before touching any formula
- [ ] Replace token-set keyword match with TF-IDF/BM25 (keep required 2× / preferred 1× weights)
- [ ] Share the search synonym map into scoring (exists in search only today)
- [ ] Score caching keyed on (resume version, parsed JD) hash
- [ ] Re-score endpoint — `POST /resumes/:id/rescore` to compare new weights against stored versions without overwriting

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

## 6. Email Digest Recommendations (6–8 h)

**Why:** turns the product from "open the app and search" into "jobs arrive to you." Builds directly on Tier 1 #1 (needs a populated index) and reuses `FeedService` + `email.service.ts`.

- [ ] User preference model — `emailDigest: { enabled, frequency: 'daily' | 'weekly' | 'off', lastSent }` on User
- [ ] Recommendation engine — reuse `FeedService` ranking (skills + watches → top 5–10 jobs)
- [ ] HTML digest template — job cards: title, company, match %, seniority, link into the app
- [ ] Scheduler/cron — daily 9 AM / weekly Monday 9 AM (node-cron or Render/GitHub scheduled workflow)
- [ ] Dedup — `digestHistory` per user; skip jobs already sent, applied to, or tracker-excluded
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
Sprint E:  6 (digest) + 7 (onboarding UI)       → 9–11 h   ← proactive + first-run fix
Sprint F:  8 (tailoring) + 9 (emulation) + 10   → 16–20 h  ← depth
Sprint G:  11 (tests) + 12 (polish)             → 12–18 h  ← quality
Sprint H:  13 (deployment)                      → 4–6 h    ← live
Later:     14 (extension v2/v3), 15 (JobPilot)  → 32–54 h  ← new tracks
```

## Dependency Map

```
1 (live index)  → nothing upstream; BLOCKS 6 (digest) and 15 (JobPilot)
2 (extension)   → independent; FEEDS 15 (knows where user applied)
3 (ATS)         → golden tests before formula changes
4 (templates)   → FEEDS 5 (cover letter export uses same engine)
5 (cover letter)→ reuses JD parse + tailoring (already built)
6 (digest)      → BLOCKED BY 1; reuses FeedService + email.service
7 (onboarding)  → independent
8–12            → independent, parallelizable
13 (deploy)     → after features stabilize
14 (ext v2/v3)  → builds on 2
15 (JobPilot)   → depends on 1 + 2
```
