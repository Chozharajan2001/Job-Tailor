# Tier-1.5 H-Batch Security Remediation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development or superpowers:executing-plans. Steps are checkbox-tracked. TDD: every behaviour gets a failing test first.

**Goal:** close the three High-severity audit items that still block deployment — H7 open registration in front of paid AI endpoints, H6 cross-tab silent-refresh race, H8 SSRF DNS-rebinding TOCTOU — and correct the four roadmap lines that today's verification pass disproved.

**Architecture:** three independent, small surfaces. H7 is a config-driven gate in front of one controller path. H6 is a cross-tab lock around the client's single refresh call. H8 pins the DNS answer that was already validated and hands that pin to the actual connection through an undici `Agent`. Nothing here changes data models, and none of it touches ranking or ingestion.

**Tech Stack:** Node 22, Express 5, Zod 4, Vitest 3 + `mongodb-memory-server`, React 19 (`navigator.locks`), undici via the global `fetch`, `dns.promises`.

**Spec:** `TODO_PLAN.md` · Tier 1.5 (H6/H7/H8) · evidence in `MVP_STATUS.md` § Security Audit.

## Context — why this, now

H7 is the only item that gates Tier 5 (#13 deployment verification): the deployed API currently lets anyone self-register and then spend the owner's AI budget. H6 is a live correctness bug — two tabs refreshing at once replay a rotated refresh token, and the server's reuse detection then revokes **every** session for that user. H8 is the last SSRF hole in the guard that already protects ingestion and the link sweep. Nothing in this batch is speculative; all three were re-confirmed in code today (see Evidence).

## Global constraints

- Gates before any commit: `npx turbo run typecheck lint build test --force --concurrency=1` from the root (`--force` or turbo replays cache; `--concurrency=1` or the fan-out aborts with exit 134 on this 8 GB box). Baseline to beat: **256 tests** (221 server / 35 files, 26 extension, 9 client), 0 lint errors, coverage 57.6/70.6/61.3/57.58 above floors 55/50/59/55.
- Every route keeps the `{ success, data | error: { code, message } }` envelope; match the shape already used in the file you edit.
- Secrets are never logged; `pino` redaction (`utils/logger.ts:12-22`) must keep covering `authorization`, `x-api-key`, `x-admin-key`.
- No new runtime dependency unless already present in `apps/server/package.json`.
- Conventional commits, **body lines ≤ 100 chars**; `.qoder/` is never staged; never `--no-verify`.
- L3 deep review + explicit user authorization before any push.

## Evidence (verified today, this session)

| Claim                                                    | Evidence                                                                                                                                            |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registration is public and rate-limited only             | `apps/server/src/routes/auth.routes.ts:141` — `authLimiter, validateBody(registerSchema), register`; no allowlist/invite anywhere in the service    |
| AI endpoints sit behind `authenticate` alone             | `resume.routes.ts:26`, `job.routes.ts:20`, `search.routes.ts:37`                                                                                    |
| Client refresh is serialized per tab only                | `apps/client/src/services/api.ts:38` (`refreshMutex` instance field), `:56-63`, `:81-106`; no `navigator.locks`/BroadcastChannel anywhere           |
| Reuse revokes all sessions                               | `apps/server/src/services/auth.service.ts:540-554`, `:608-629`                                                                                      |
| Guard resolves, validates, then fetches the **hostname** | `apps/server/src/utils/url-guard.ts:109-126` (validate) then `:167-169` (`assertSafePublicUrl(currentUrl)`; `fetch(currentUrl, …)`) — TOCTOU window |
| VerifyEmailPage retries unbounded                        | `apps/client/src/pages/VerifyEmailPage.tsx:97-101` + `:68-70` (re-fires while a token is present and `success` is false)                            |

## Four corrections this pass proved — do these first

My earlier checklist was wrong in four places. Fix the roadmap text so no one plans against it again.

1. **H8's cleanup half is already fixed.** `cleanup.service.ts:111-114` uses `safeFetchText`; its `startsWith("local://")` / `("http://127.0.0.1")` checks at `:98-100` are an early-skip for synthetic URLs, not validation. Drop that clause from the H8 line.
2. **M4 is narrower than written.** `public_id` is randomized with a `_Date.now()` suffix and there is no `eager` parameter anywhere; the real residual issue is `type: "upload"` (public) instead of `type: "private"` at `pdf-generator.service.ts:248-255`, plus a user-influenced prefix.
3. **M2 lives in controllers, not the error middleware.** `error-handler.ts:156-164` only leaks in non-production; the unconditional raw-message echoes are `search.controller.ts:34-38`, `job.controller.ts:267-272`, `resume.controller.ts:250-254`, `analytics.controller.ts:363/413/432/479`.
4. **H4's test doesn't cover the controller.** `tests/job.test.ts:173` asserts `savedAt` through `Job.create`, not the HTTP `createJob` path (`controllers/job.controller.ts:14-27` relies on the schema default). Add that to Tier 1.5's test list.

- [x] **Task 0.** Edit the four lines in `TODO_PLAN.md` (H8, M2, M4, and the H4 test gap) to match the evidence above, then `npx prettier --write TODO_PLAN.md` and commit as `docs: correct four audit items disproved by code re-verification`.

---

## Task 1 — H7: registration gate (blocks deployment)

**Files:**

- Create: `apps/server/src/utils/registration-gate.ts`
- Modify: `apps/server/src/config/index.ts` (add `registration` block near `:62`)
- Modify: `apps/server/src/controllers/auth.controller.ts` (`register`)
- Modify: `SETUP.md`, `README.md` (env table)
- Test: `apps/server/src/tests/registration-gate.test.ts`

**Interfaces:**

- Produces `checkRegistration(email: string): { allowed: true } | { allowed: false; code: "REGISTRATION_CLOSED" | "EMAIL_NOT_ALLOWED" }`
- Consumes `config.registration.mode` (`open` | `allowlist` | `closed`, default **`open`** so every existing test and local dev flow keeps working) and `config.registration.allowlist` from `REGISTRATION_EMAIL_ALLOWLIST` (comma-separated exact addresses).

- [x] **Step 1 — failing test** for the pure helper: `closed` refuses everything; `allowlist` accepts a listed address and refuses an unlisted one; comparison is case-insensitive and trims whitespace; `open` accepts (and an empty allowlist under `allowlist` mode refuses all, so a misconfiguration fails closed rather than open).
- [x] **Step 2 — run it:** `cd apps/server && npx vitest run src/tests/registration-gate.test.ts` → expect failure (module missing).
- [x] **Step 3 — implement** the helper, then the config block:
  ```ts
  registration: {
    mode: (process.env.REGISTRATION_MODE || "open") as
      | "open"
      | "allowlist"
      | "closed",
    allowlist: (process.env.REGISTRATION_EMAIL_ALLOWLIST || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  },
  ```
  and in `validateConfig()` reject an unknown `REGISTRATION_MODE` value at boot.
- [x] **Step 4 — enforce in the controller** before any user is created, mirroring the file's existing 400 shape:
  ```ts
  const gate = checkRegistration(email);
  if (!gate.allowed) {
    return res.status(403).json({
      success: false,
      error: {
        code: gate.code,
        message: "Registration is not available for this address",
      },
    });
  }
  ```
  Gate the **service** too if any other route can create a user (check `/auth/register` only, plus any admin-created-user path).
- [x] **Step 5 — route-level test** in the existing auth suite style (`tests/auth.test.ts`): with `REGISTRATION_MODE=allowlist` and a listed address → 201/200 as today; with an unlisted address → 403 `EMAIL_NOT_ALLOWED` and **no User document created**; with `closed` → 403 `REGISTRATION_CLOSED`.
- [x] **Step 6 — run:** `cd apps/server && npx vitest run --no-file-parallelism src/tests/registration-gate.test.ts src/tests/auth.test.ts` → all pass.
- [x] **Step 7 — docs:** add both env vars to `SETUP.md` and `README.md` with the note that any deployment **must** set `REGISTRATION_MODE` (default `open` is dev-only).
- [x] **Step 8 — full gate, then commit** `feat(server): gate self-registration behind an env allowlist`.

## Task 2 — H6: cross-tab silent-refresh lock + bounded verify retry

**Files:**

- Modify: `apps/client/src/services/api.ts` (`getRefreshMutex` `:56-63`, `performSilentRefresh` `:81-106`)
- Modify: `apps/client/src/pages/VerifyEmailPage.tsx` (`:68-70`, `:97-101`)
- Test: `apps/client/src/tests/refresh-lock.test.ts` (new), extend `src/tests/pages.test.tsx`

**Interfaces:** consumes `navigator.locks`; produces `private async withRefreshLock(): Promise<string>` that serializes refresh across tabs **and** keeps the existing in-tab mutex.

- [x] **Step 1 — failing test:** two concurrent `trySilentRefresh()` calls must produce exactly **one** `/auth/refresh` fetch. Stub `navigator.locks` in jsdom (it is absent by default) and assert the request count, and assert the code still works when `navigator.locks` is undefined (single-tab fallback through the existing mutex).
- [x] **Step 2 — run it:** `cd apps/client && npx vitest run src/tests/refresh-lock.test.ts` → expect failure.
- [x] **Step 3 — implement:**
  ```ts
  private async performSilentRefreshLocked(): Promise<string> {
    // The refresh token rotates server-side and the cookie is shared by every
    // tab on the origin, so two tabs refreshing at once makes the second
    // replay a spent token — reuse detection then revokes ALL sessions.
    if (typeof navigator !== "undefined" && "locks" in navigator) {
      return navigator.locks.request(
        "jobtailor:silent-refresh",
        () => this.performSilentRefresh(),
      );
    }
    return this.performSilentRefresh();
  }
  ```
  and have `getRefreshMutex()` await that instead of calling `performSilentRefresh()` directly.
- [x] **Step 4 — bound the verify retry:** cap the auto-verify effect at 3 attempts (`useRef` counter, stops when reached and surfaces the existing manual retry UI instead of looping forever). Test it: after three failing verifications no fourth request is made.
- [x] **Step 5 — run:** `cd apps/client && npx vitest run && npm run typecheck` → all pass, 0 errors.
- [x] **Step 6 — manual browser check** (this is the step #16 skipped): open two tabs of the app, kill the access token, let both refresh, and confirm the server does **not** revoke sessions (network tab: one refresh, one 200 each, no 401 storm). Report what you actually see.
- [x] **Step 7 — commit** `fix(client): serialize silent refresh across tabs; bound verify-email retries`.

## Task 3 — H8: pin the validated IP for the real connection

**Files:**

- Modify: `apps/server/src/utils/url-guard.ts` (`:109-126` validation, `:167-177` fetch)
- Test: `apps/server/src/tests/url-guard-pinning.test.ts`

**Interfaces:** `assertSafePublicUrl` returns the validated records (`{ parsed, addresses }`); `safeFetchText` builds one undici `Agent` per call whose `lookup` can only answer from that pinned set, and passes it as `{ dispatcher }`.

- [x] **Step 1 — confirm the toolchain before designing around it:** `cd apps/server && node -e "console.log(require('undici/package.json').version)"` and `node -e "console.log(typeof globalThis.fetch)"`. If `undici` is not a direct dependency, use `import { Agent } from "undici"` only if it resolves through the workspace root; otherwise stop and report — do not hand-roll a raw-socket fetch.
- [x] **Step 2 — failing test:** start a local `http.server` on 127.0.0.1; stub `dns.promises.lookup` so the **first** call returns a public-looking address and the **second** returns `127.0.0.1` (the rebinding pattern); call `safeFetchText("http://rebind.test/")`; assert it throws and that the peer address actually used was the pinned public one, never the loopback one. Today this test passes the guard and connects on the second lookup — that is the bug.
- [x] **Step 3 — run it:** expect failure (no pinning yet).
- [x] **Step 4 — implement** the pin: keep the existing private-range checks, return the resolved records from `assertSafePublicUrl`, and construct the dispatcher per hop so a redirect cannot inherit the previous hop's pin (redirects are followed manually at `:166-169`, so build the agent inside the loop):
  ```ts
  const pinned = addresses.map((a) => a.address);
  const dispatcher = new Agent({
    connect: {
      lookup: (_host: string, opts: any, cb: any) => {
        const pick = pinned.filter((ip) => (opts.all ? true : true));
        if (opts.all) {
          return cb(
            null,
            pick.map((address) => ({
              address,
              family: address.includes(":") ? 6 : 4,
            })),
          );
        }
        return cb(null, pick[0], pick[0].includes(":") ? 6 : 4);
      },
    },
  });
  ```
  plus an explicit `servername` (SNI) so TLS still validates the hostname, and `dispatcher.close()` in a `finally`.
- [x] **Step 5 — run:** expect the rebinding test to fail closed. Then re-run the SSRF suite that already exists (search `url-guard` / `ssrf` in `src/tests/`) to confirm the literal-IP, private-range, and redirect paths still behave.
- [x] **Step 6 — full server gate:** `cd apps/server && npx vitest run --no-file-parallelism` → 221+ pass, then root gate with `build`.
- [x] **Step 7 — commit** `fix(server): pin the validated DNS answer for SSRF-guarded fetches`.

## Task 4 — docs, baseline, review gate

- [x] `docs/api-reference.md`: document `REGISTRATION_MODE` / `REGISTRATION_EMAIL_ALLOWLIST`, the 403 codes, and the refreshed error semantics of the guard.
- [x] `TODO_PLAN.md`: tick H6/H7/H8; add the H4 controller-test gap as its own open item if Task 0 did not already fix it; note that the extension items (M11/M12) are a separate plan.
- [x] Re-measure and rewrite the baseline (`npx turbo run typecheck lint build test --force --concurrency=1`, then server coverage) and update README / SETUP / docs/architecture.md / docs/development-guide.md with the real numbers.
- [x] `qodersec review --layer=l3`, report findings honestly, then **ask before pushing**.

## Sequencing after this plan

Deliberately separate plans, in this order:

1. **Extension hardening (M11, M12, plus the two open #2 sub-items)** — different runtime, different tests.
2. **Server hardening M-batch (M1–M5, M7–M10 minus the parts done here)** — mostly small, independent; the #16 leftovers `expiredAt` and `salaryRange` belong to this cluster.
3. **Repo hygiene L-batch** — pin GH Actions to SHAs (also needed before the 2026-10-19 Ubuntu 26 migration), gitignore `.qoder/`, Zod on `PUT /jobs/:id`, `npm audit` (3 advisories).
4. **#13 deployment verification** — only after H7, and it also fixes the red `Poll job sources` schedule (missing `JOBTAILOR_API_BASE` / `SOURCE_POLL_ADMIN_KEY`).
5. **#7 onboarding UI fixes** — the product-value alternative if you'd rather not spend the next block on security.

## Verification (end-to-end)

- Root: `npx turbo run typecheck lint build test --force --concurrency=1` → `successful, 0 cached`, exit 0; test count strictly greater than 256; coverage ≥ floors (55/50/59/55).
- H7: the new allowlist test refuses an unlisted address **and** asserts zero new `User` documents; a default-config run proves existing flows are untouched.
- H6: the refresh test proves one `/auth/refresh` per concurrent burst; the two-tab browser pass proves no session wipe (report actual observation, not intent).
- H8: the rebinding test proves the guard fails closed against a second, private DNS answer.
- Post-push: CI run green through the `Server coverage floor` step; `git rev-list --left-right --count origin/master...HEAD` → `0 0`.
- Nothing here may change ghost scoring, ranking, or the ingestion funnel — if `ghost-*.test.ts` results move, that is a regression to investigate, not to accept.

## Execution Log (2026-09-30)

Executed on `master` in plan order; each task red-first, then green, then committed.

| Task   | Commit                   | Notes and deviations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0      | `746dd56`                | All four corrections landed. H8's cleanup half was already done — that clause was removed here before any code was written, so nobody "fixed" it twice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 1 (H7) | `9f68c6d`                | `registrationPolicyFromEnv`/`checkRegistration` read the environment per request, so a deploy can close sign-up without a restart; unknown mode fails closed **and** `validateConfig` rejects it at boot. Default `open`, so the existing auth suite is untouched (21 tests across the three files). First commit attempt failed the pre-commit hook with two real `no-undef` errors (`NodeJS` namespace in type position under this ESLint config) — fixed by using `Record<string, string \| undefined>`, not by bypassing the hook.                                                                                                                  |
| 2 (H6) | `3b51da1`                | Web Lock name `jobtailor:silent-refresh`, mutex-only fallback. Client tests needed an in-memory `localStorage` installed before importing the store: Node 25's native `localStorage` shadows jsdom's and throws without `--localstorage-file` (previously hidden because no client test had ever touched the token store).                                                                                                                                                                                                                                                                                                                              |
| 3 (H8) | `6b5ff0e` then `162a101` | **Plan correction:** undici is _not_ installed (not even hoisted to the workspace root) and Node's built-in `fetch` rejects a foreign dispatcher, so the "stop and report" branch in Step 1 was taken and the user chose the dependency-free option. Transport moved to `node:http`/`node:https` with `lookup: createPinnedLookup(...)` + `servername`, `Accept-Encoding: gzip, deflate, br` with `node:zlib` decoding, the 2 MB cap, and a per-hop re-pin. The four `global.fetch` stubs in `search-engine.test.ts` were re-pointed at the new transport. Mutation check: deleting the pinned `lookup` fails 2 of 9 pinning tests; restored state 9/9. |
| 4      | this commit              | api-reference "Environment-Dependent Behaviour" section, `.env.example` + SETUP rows, H6/H7/H8 ticked in the roadmap, baselines re-measured.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

**Real-browser verification (Task 2 Step 6) — performed.** Server on `:5055` pointed at a **local** compose Mongo (`apps/server/.env` targets MongoDB Atlas, so the URI was overridden in the process environment to avoid writing test data to the real database), Vite on `:5173`. In the browser, with the lock held by another request for ~1.7 s, the client issued **0** `/auth/refresh` requests while held and **exactly 1** after release (`hasLocks: true`, 401 because the tab had no session — no writes to any database). Limitation stated plainly: this was one document holding the lock while the client's own call waited; it was not two physical tabs, though Web Locks are scoped per top-level browsing context and the unit tests cover the same code path.

**Fresh gate after the batch:** `npx turbo run typecheck lint build test --force --concurrency=1` → `13 successful, 13 total, 0 cached`, exit 0. **280 tests** (240 server / 38 files, 26 extension, 14 client), 0 lint errors (159 server + 95 client warnings). Server coverage `58.74 / 72.07 / 62.54 / 58.74`, above the 55/50/59/55 floors.

**Found while executing (added to the roadmap as H9, not fixed here):** the access token is persisted to localStorage by zustand `persist` with no `partialize`, contradicting three code comments and the security checklist line I had written earlier from them.
