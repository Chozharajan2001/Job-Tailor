# JobTailor API Reference

> Base URL: `/api/v1`  
> Authentication: Bearer token, unless marked public.  
> This document reflects the routes currently implemented in `apps/server/src/routes`.

## Response Shape

Successful responses:

```json
{
  "success": true,
  "data": {}
}
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

## Auth

| Method | Endpoint | Auth | Status | Notes |
| --- | --- | --- | --- | --- |
| POST | `/auth/register` | Public | Implemented | Creates user and returns user, access token, refresh token |
| POST | `/auth/login` | Public | Implemented | Returns user, access token, refresh token |
| POST | `/auth/refresh` | Public | Implemented | Refreshes access token |
| GET | `/auth/me` | Required | Implemented | Returns current user |
| POST | `/auth/logout` | Required | Implemented | Stateless logout response |

## Profile

| Method | Endpoint | Status | Notes |
| --- | --- | --- | --- |
| GET | `/profile` | Implemented | Gets or creates the authenticated user's profile |
| PUT | `/profile` | Implemented | Updates profile fields currently allowed by route validation |
| POST | `/profile/skills` | Implemented | Adds one skill |
| PUT | `/profile/skills/:id` | Implemented | Route exists, update validation should be tightened |
| DELETE | `/profile/skills/:id` | Implemented | Deletes one skill |
| POST | `/profile/experience` | Implemented | Adds one experience block |
| PUT | `/profile/experience/:id` | Implemented | Route exists, update validation should be tightened |
| DELETE | `/profile/experience/:id` | Implemented | Deletes one experience block |
| POST | `/profile/projects` | Implemented | Adds one project |
| PUT | `/profile/projects/:id` | Implemented | Route exists, update validation should be tightened |
| DELETE | `/profile/projects/:id` | Implemented | Deletes one project |

Not implemented yet:

- Education CRUD
- Certification CRUD
- Dedicated summary patch endpoint

## Jobs

| Method | Endpoint | Status | Notes |
| --- | --- | --- | --- |
| POST | `/jobs` | Implemented | Creates a job from manually supplied JD text |
| GET | `/jobs` | Implemented | Supports `page`, `limit`, `status`, `search`, `sortBy`, `sortOrder` |
| GET | `/jobs/:id` | Implemented | Gets one job |
| PUT | `/jobs/:id` | Implemented | Updates selected job fields |
| DELETE | `/jobs/:id` | Implemented | Deletes one job |
| POST | `/jobs/:id/parse` | Implemented | Calls OpenAI and stores parsed JD |

Not implemented yet:

- JD URL fetching
- `/jobs/:id/parsed`
- Async parse polling

## Resumes

| Method | Endpoint | Status | Notes |
| --- | --- | --- | --- |
| POST | `/resumes/generate` | Implemented | Generates tailored resume content and ATS score for a parsed job |
| GET | `/resumes` | Implemented | Optional `jobId` filter |
| GET | `/resumes/:id` | Implemented | Gets one resume |
| PUT | `/resumes/:id` | Implemented | Updates resume fields |

The PDF generation service exists at `apps/server/src/services/pdf-generator.service.ts`, but no route currently calls it.

Not implemented yet:

- `/resumes/:id/pdf`
- `/resumes/:id/regenerate`
- Persisted `pdfUrl` workflow
- Download/export UI

## Applications

| Method | Endpoint | Status | Notes |
| --- | --- | --- | --- |
| GET | `/applications` | Implemented | Optional `status` filter |
| GET | `/applications/:id` | Implemented | Returns populated job and resume |
| PATCH | `/applications/:id/status` | Implemented | Moves status and records previous status/timeline event |
| POST | `/applications/:id/notes` | Implemented | Adds a timeline note |
| POST | `/applications/:id/reminders` | Implemented | Adds a reminder and timeline event |

Not implemented yet:

- `POST /applications`
- Delete application endpoint
- Complete reminder endpoint
- Custom timeline endpoint
- Callback/rejection outcome endpoint

## Analytics

| Method | Endpoint | Status | Notes |
| --- | --- | --- | --- |
| GET | `/analytics/overview` | Implemented | Dashboard totals, pipeline, skill gaps, resume performance |
| GET | `/analytics/resume-performance` | Implemented | Returns resumes populated with job data |
| GET | `/analytics/status-breakdown` | Implemented | Counts by status |
| GET | `/analytics/skill-gap-report` | Implemented | Aggregates gaps from parsed jobs and scored resumes |

## Important Product Gaps

- There is no normal API flow to create an application from a generated resume.
- PDF export is not wired to an endpoint.
- Reminder completion and outcome tracking are missing.
- Some update routes use loose validation and should be tightened.
