# JobTailor MVP Status

> Last updated: 2026-05-14

## Summary

JobTailor is a buildable MVP foundation. The repo compiles and the main AI resume-tailoring loop exists, but the full job application tracker workflow is not complete yet.

Verified:

```bash
npm run typecheck
npm run build
```

## Completed

- Monorepo with client, server, shared types, and deploy configs.
- JWT auth with register, login, refresh, logout, and current-user endpoint.
- MongoDB models for users, profiles, jobs, resumes, and applications.
- Master profile API for skills, experience, and projects.
- Manual JD entry.
- OpenAI JD parsing.
- Tailored resume generation from profile and parsed JD.
- ATS score breakdown with matched, missing, weak skills, and action items.
- Dashboard, profile, jobs, resume tailor, tracker, analytics, and interview mode pages.
- Application status update, notes, and reminders backend endpoints.
- Rate limiting, validation, error handling, CORS, Helmet.
- TypeScript and production build are passing.

## Partially Done

- Master Profile UI: skills, experience, and projects are present; education is display-only and certifications are not surfaced.
- Resume tailoring: summary rewrite, bullet prioritization, and project selection exist; deeper skill relevance ordering is still basic.
- ATS scoring: useful heuristic exists; true TF-IDF and robust semantic evaluation are not production-grade yet.
- Tracker: Kanban-style board exists; drag/drop and application creation flow are missing.
- Analytics: basic metrics exist; outcome tracking is not strong enough yet for reliable callback/rejection insights.
- Interview Mode: split view exists; tracker does not expose a natural open-interview-mode action.
- PDF: service exists; route and UI are missing.

## Pending MVP Work

1. Add application creation flow.
   - Backend: `POST /applications`
   - UI: "Mark applied" or "Create application" from job/resume
   - Link job, resume, status, applied date

2. Wire PDF export.
   - Backend: `GET /resumes/:id/pdf`
   - Save `pdfUrl` on resume
   - UI: download/export button

3. Complete tracker workflows.
   - Reminder UI
   - Complete reminder endpoint
   - Interview mode link from application card
   - Outcome fields: callback received, rejected reason, offer

4. Tighten profile workflows.
   - Education CRUD
   - Certification CRUD
   - Better project tag editing
   - Stronger update validation schemas

5. Improve analytics.
   - Track applications created from resumes
   - Record callbacks/rejections from UI
   - Calculate interview rate and resume performance from real outcome events

6. Add search and filters.
   - Filter by resume focus
   - Follow-up due
   - Missing skill
   - Company/status/date applied

7. Add tests.
   - Auth API tests
   - Job CRUD and parse route tests
   - Resume generation tests with mocked OpenAI
   - Application status/history tests
   - Client smoke tests for major pages

## Out Of Scope For MVP

- Auto-apply bots
- LinkedIn/Indeed scraping
- Interview prep generator
- Salary negotiation AI
- Team or enterprise features

## Honest Completion Estimate

| Area | Completion |
| --- | --- |
| Project setup | 90% |
| Auth | 80% |
| Profile | 60% |
| JD ingestion | 65% |
| Resume tailoring | 65% |
| ATS scoring | 60% |
| Application tracker | 45% |
| PDF export | 25% |
| Analytics | 45% |
| Tests | 0% |

Overall MVP completion: approximately 55-65%.
