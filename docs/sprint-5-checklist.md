# Sprint 5 Execution Checklist — MVP Workflow Completion

> Status: **COMPLETE** — all items verified 2026-06-23
>
> Verification: `npm run typecheck` ✅ · `npm run test` ✅ (41 tests) · `npm run build` ✅

This checklist is the durable execution record for Sprint 5.

---

## 1. Code Implementation

### Backend

- [x] **`offerAmount` field on `Application` model** — added `offerAmount?: string` to `IApplication` interface and `applicationSchema` in `Application.model.ts`. Stored as optional free-text for MVP flexibility.
- [x] **`recordOutcome` endpoint** — `PATCH /api/v1/applications/:id/outcome` accepts `callbackReceived` (boolean), `rejectedReason` (string), `offerAmount` (string) in any combination. Pushes timeline events for each change recorded.
- [x] **`completeReminder` endpoint** — `PATCH /api/v1/applications/:id/reminders/:rid/complete` marks a reminder `isCompleted: true`, sets `completedAt`, and appends a timeline event. Returns 409 on double-complete.
- [x] **Route registration** — both new routes registered in `application.routes.ts` with Zod validation schemas. `idRidParamSchema` added for compound `/:id/reminders/:rid/complete` route.

### Analytics Fix

- [x] **`interviewRate` fixed** — now counts `status: { $in: ['interview', 'offer'] }` instead of the dead `callbackReceived: true` path. Immediately meaningful from application status alone.
- [x] **`offerRate` added** — new metric counting `status: 'offer'` / total, included in `getOverview` response.
- [x] **`resumePerformance.callbackRate` fixed** — now counts applications in `interview` or `offer` status per resume version rather than `callbackReceived`.

### Client Integration

- [x] **PDF Export button on `ResumeTailorPage`** — added alongside the "Create Application" button after resume generation. Calls `POST /resumes/:id/pdf` on the latest version, opens result in a new tab. Shows spinner while pending.
- [x] **`IApplication` type extended** — `callbackReceived`, `rejectedReason`, `offerAmount`, `reminders` added to the client-side type in `TrackerPage.tsx`.
- [x] **Outcome and reminder mutations** — `recordOutcomeMutation` and `completeReminderMutation` added to `TrackerPage`.
- [x] **Outcomes tab in `ApplicationDetailModal`** — fourth tab exposing:
  - Callback received toggle switch (fires `PATCH /:id/outcome`)
  - Rejection reason text input + Save button
  - Offer details free-text input + Save button
  - Reminders list with ✓ Done button per incomplete reminder; completed reminders shown with strikethrough
- [x] **`AnalyticsPage` updated** — `offerRate` added to `DashboardData` type and rendered as a 5th KPI tile. Interview rate label updated to "Interview/Offer Rate".

---

## 2. Tests

- [x] **`application-workflow.test.ts`** — new integration test file with 7 tests:
  - `recordOutcome`: callbackReceived toggle, rejectedReason, offerAmount
  - `completeReminder`: marks done, appends timeline event, idempotent
  - Analytics rate computation: interviewRate and offerRate from application status

---

## 3. Proof & Verification

### Automated Proofs

- [x] **Workspace Typechecks** — `npm run typecheck` passes cleanly (3/3 packages, 0 cached).
- [x] **Workspace Build** — `npm run build`
- [x] **Vitest Test Suite** — `npm run test -w job-tailor-server` — **41 tests pass** (34 search engine + 7 Sprint 5 workflow)

### Sprint 5 Success Criteria

| Criterion | Status |
|---|---|
| Application outcomes can be recorded (callback, rejection, offer) | ✅ |
| Reminders can be marked complete | ✅ |
| Analytics `interviewRate` and `offerRate` are meaningful from day 1 | ✅ |
| PDF export accessible from the tailor page | ✅ |
| Tracker UI exposes outcome workflow cleanly in a dedicated tab | ✅ |
| Repo passes typecheck | ✅ |
| Repo passes tests (41/41) | ✅ |
| Repo passes build | ✅ |
