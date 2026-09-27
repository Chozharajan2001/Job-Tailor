# JobTailor API Reference

> Base URL: `/api/v1` (except `GET /health`)  
> Authentication: `Authorization: Bearer <accessToken>` unless another scheme is noted.  
> This document reflects the routes mounted in `apps/server/src/app.ts` as of 2026-09-27.

## Response Shape

Successful responses:

```json
{ "success": true, "data": {} }
```

Error responses:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": []
  }
}
```

Every response carries an `X-Request-Id` header (inbound value honored, else generated);
error log lines are correlated under the same id.

## Health

| Method | Endpoint  | Auth   | Notes                      |
| ------ | --------- | ------ | -------------------------- |
| GET    | `/health` | Public | `{ status: "ok", uptime }` |

## Auth — `/api/v1/auth`

| Method | Endpoint                    | Auth                       | Notes                                                   |
| ------ | --------------------------- | -------------------------- | ------------------------------------------------------- |
| POST   | `/auth/register`            | Public (rate-limited)      | Creates user, sends verification email, returns tokens  |
| POST   | `/auth/verify-email`        | Public                     | Verifies email token                                    |
| POST   | `/auth/resend-verification` | Public                     | Resends verification email                              |
| POST   | `/auth/login`               | Public (strict rate limit) | Returns user, access token, refresh token; audit-logged |
| POST   | `/auth/refresh`             | Public                     | Rotates refresh token                                   |
| GET    | `/auth/me`                  | Bearer                     | Returns current user                                    |
| POST   | `/auth/logout`              | Bearer                     | Logs out current session                                |
| POST   | `/auth/logout-all`          | Bearer                     | Revokes all sessions                                    |
| POST   | `/auth/forgot-password`     | Public                     | Sends reset email                                       |
| POST   | `/auth/reset-password`      | Public                     | Completes reset with token                              |
| POST   | `/auth/change-password`     | Bearer                     | Changes password, revokes other sessions                |

## Profile — `/api/v1/profile`

| Method              | Endpoint                        | Notes                                                  |
| ------------------- | ------------------------------- | ------------------------------------------------------ |
| GET                 | `/profile`                      | Gets or creates the authenticated user's profile       |
| PUT                 | `/profile`                      | Updates allowed profile fields                         |
| POST                | `/profile/upload`               | Multipart resume upload → populates profile (Phase 10) |
| POST / PUT / DELETE | `/profile/skills[/:id]`         | Skill CRUD                                             |
| POST / PUT / DELETE | `/profile/experience[/:id]`     | Experience CRUD                                        |
| POST / PUT / DELETE | `/profile/projects[/:id]`       | Project CRUD                                           |
| POST / PUT / DELETE | `/profile/education[/:id]`      | Education CRUD                                         |
| POST / PUT / DELETE | `/profile/certifications[/:id]` | Certification CRUD                                     |

## Jobs — `/api/v1/jobs`

| Method | Endpoint                  | Notes                                                               |
| ------ | ------------------------- | ------------------------------------------------------------------- |
| POST   | `/jobs`                   | Creates a job from manually supplied JD text                        |
| GET    | `/jobs`                   | Supports `page`, `limit`, `status`, `search`, `sortBy`, `sortOrder` |
| GET    | `/jobs/:id`               | Gets one job                                                        |
| PUT    | `/jobs/:id`               | Updates selected job fields                                         |
| DELETE | `/jobs/:id`               | Deletes one job                                                     |
| POST   | `/jobs/:id/parse`         | Runs the AI JD parse and stores `structuredJD`                      |
| PATCH  | `/jobs/:id/attach-resume` | Attaches a generated resume to the job                              |

## Resumes — `/api/v1/resumes`

| Method | Endpoint                   | Notes                                                                    |
| ------ | -------------------------- | ------------------------------------------------------------------------ |
| POST   | `/resumes/generate`        | Generates tailored resume content + ATS score for a parsed job           |
| GET    | `/resumes`                 | Optional `jobId` filter                                                  |
| POST   | `/resumes/profile`         | Creates/updates the profile-level (master) resume                        |
| PUT    | `/resumes/profile`         | Updates the profile-level resume                                         |
| GET    | `/resumes/profile`         | Returns the profile-level resume                                         |
| GET    | `/resumes/reuse`           | Two-type system: returns the reusable resume when eligible               |
| GET    | `/resumes/:id`             | Gets one resume                                                          |
| PUT    | `/resumes/:id`             | Updates resume fields                                                    |
| POST   | `/resumes/:id/pdf`         | Renders the resume to PDF via Puppeteer and returns it (wired in app.ts) |
| POST   | `/resumes/upload`          | Multipart resume PDF upload                                              |
| POST   | `/resumes/quick-ats-check` | Fast ATS check without full generation                                   |

## Applications — `/api/v1/applications`

| Method | Endpoint                                    | Auth            | Notes                                                                                                                                                                                                                                   |
| ------ | ------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/applications`                             | Bearer          | Creates an application for a job                                                                                                                                                                                                        |
| GET    | `/applications`                             | Bearer          | Optional `status` filter                                                                                                                                                                                                                |
| GET    | `/applications/:id`                         | Bearer          | Returns populated job and resume                                                                                                                                                                                                        |
| PATCH  | `/applications/:id/status`                  | Bearer          | Moves status; records previous status + timeline event                                                                                                                                                                                  |
| POST   | `/applications/:id/notes`                   | Bearer          | Adds a timeline note                                                                                                                                                                                                                    |
| POST   | `/applications/:id/reminders`               | Bearer          | Adds a reminder + timeline event                                                                                                                                                                                                        |
| PATCH  | `/applications/:id/reminders/:rid/complete` | Bearer          | Completes a reminder                                                                                                                                                                                                                    |
| PATCH  | `/applications/:id/outcome`                 | Bearer          | Records offer/rejection outcome                                                                                                                                                                                                         |
| DELETE | `/applications/:id`                         | Bearer          | Deletes an application                                                                                                                                                                                                                  |
| POST   | `/applications/from-extension`              | **`x-api-key`** | Extension auto-track: idempotent find-or-create job (exact URL, then company+title within 60 days) + application with `applied` status. Unique `(userId, jobId)` index prevents duplicates. Registered before the JWT-protected router. |

## Job Discovery / Search — mounted at `/api/v1`

| Method         | Endpoint             | Notes                                                        |
| -------------- | -------------------- | ------------------------------------------------------------ |
| POST           | `/ingest/url`        | Fetches a job page, extracts JSON-LD, ingests a CanonicalJob |
| POST           | `/ingest/paste`      | Ingests a pasted JD                                          |
| GET            | `/`                  | Searches CanonicalJobs (filter/sort/paginate)                |
| GET            | `/feed`              | Per-user recommended feed                                    |
| POST           | `/sources`           | Registers a job source                                       |
| POST           | `/sources/:id/trust` | Adjusts source trust                                         |
| POST           | `/analytics/click`   | Records a click event                                        |
| POST / GET     | `/saved`             | Create / list saved searches                                 |
| PATCH / DELETE | `/saved/:id`         | Update / delete a saved search                               |
| GET            | `/alerts`            | Lists match alerts                                           |
| PATCH          | `/alerts/:id/read`   | Marks one alert read                                         |
| PATCH          | `/alerts/read-all`   | Marks all alerts read                                        |
| POST / GET     | `/watches`           | Create / list search watches (digest pipeline)               |
| PATCH / DELETE | `/watches/:id`       | Toggle / delete a watch                                      |

## API Keys — `/api/v1/apikeys` (Bearer JWT)

Long-lived keys (`jtk_` + 40 hex chars) for the browser extension. Only the SHA-256 hash
is stored; the raw key is returned exactly once and never logged (audit trails carry the
safe 8-char prefix).

| Method | Endpoint              | Notes                                                             |
| ------ | --------------------- | ----------------------------------------------------------------- |
| POST   | `/apikeys`            | Issues a key; returns the raw value once (`data.key`)             |
| GET    | `/apikeys`            | Lists keys (prefix, name, timestamps — never the hash or raw key) |
| PATCH  | `/apikeys/:id/revoke` | Revokes a key; extension requests then fail 401                   |

Issuance, revocation, and failed key authentication write `API_KEY_ISSUED` /
`API_KEY_REVOKED` / `API_KEY_AUTH_FAILED` records to the AuditLog collection.

## Admin — `/api/v1/admin` (**`x-admin-key`**)

Gated by `SOURCE_POLL_ADMIN_KEY` (constant-time compare). When the env var is unset the
routes answer 503 `ADMIN_NOT_CONFIGURED`; a wrong key answers 401.

| Method | Endpoint                  | Notes                                                                      |
| ------ | ------------------------- | -------------------------------------------------------------------------- |
| POST   | `/admin/poll-due-sources` | Body `{ companyId?, limit? }` (Zod-validated); polls due connector sources |
| POST   | `/admin/seed-sources`     | Body `{ companyId, ats, slug }`; idempotent source registration            |

## Analytics — `/api/v1/analytics`

| Method | Endpoint                        | Notes                                                      |
| ------ | ------------------------------- | ---------------------------------------------------------- |
| GET    | `/analytics/overview`           | Dashboard totals, pipeline, skill gaps, resume performance |
| GET    | `/analytics/resume-performance` | Resumes populated with job data                            |
| GET    | `/analytics/status-breakdown`   | Counts by status                                           |
| GET    | `/analytics/skill-gap-report`   | Gaps aggregated from parsed jobs and scored resumes        |

## Still Not Implemented

- Async parse polling (`POST /jobs/:id/parse` is synchronous)
- Client-side Settings → API keys management page (extension keys are currently issued directly via this API)
- Manual Chrome UI verification of the extension (load `apps/extension/dist` as an unpacked extension in a real browser) — tracked in TODO_PLAN.md
