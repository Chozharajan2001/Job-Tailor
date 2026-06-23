# Sprint 3 Execution Checklist - Workflow & Personalized Feed

This checklist details the code changes and validation steps implemented for Sprint 3 (Workflow, Feeds, and Stale URL verification).

## 1. Code Implementation

### Backend Architecture
- [x] **Watch Model**: Created `Watch.model.ts` inside `apps/server/src/models/` carrying fields for `userId`, `type` (`'company' | 'title'`), `value`, and `isEnabled`, with a compound unique index on `{ userId: 1, type: 1, value: 1 }`.
- [x] **Shared Types Extension**: Added `IWatch` to `packages/shared-types/src/index.ts` to keep client and server models aligned.
- [x] **Watch CRUD Endpoints**: Implemented creation, listing, status toggling, and deletion in `watch.controller.ts` and routes.
- [x] **Alert Dispatcher Watch Triggers**: Extended `AlertDispatcherService` to matching title and company watches on brand new canonical job ingestion, avoiding duplicate alerts and ignoring disabled watches.
- [x] **Curated Feed Service**: Built `FeedService` in `feed.service.ts` to query active canonical jobs matching user profile skills and watches, ranking them deterministically and excluding jobs the user has already saved or tracker-imported.
- [x] **Feed Retrieval Route**: Added `GET /api/v1/search/feed` endpoint to return the curated list.
- [x] **Alert Lifecycle Polish**: Added `PATCH /api/v1/search/alerts/read-all` to mark all unread alerts read in a single batch query.
- [x] **Lightweight Link Verification**: Enhanced `CleanupService` with asynchronous HTTP status checking of active jobs to flag 404s or redirect-to-homepage behaviors and mark them inactive.

### Client Integration
- [x] **Discover Feed View**: Added a "Curated Feed" sub-view inside `JobsPage.tsx` displaying personalized suggestions based on profile skills and watches.
- [x] **Watches Panel**: Designed a configuration sidebar for title/company watches allowing users to create, list, toggle, and delete watch triggers.
- [x] **Dismiss All Button**: Wired batch alert read mutation to clear the inbox.
- [x] **Visual Tags**: Added a `🎯 Watched` badge onto cards that matched the user's watches.

---

## 2. Proof & Verification

### Automated Proofs
- [x] **Workspace Typechecks**: Verified TypeScript builds cleanly across packages (`npm run typecheck`).
- [x] **Workspace Builds**: Verified client assets build and server compiles cleanly for production (`npm run build`).
- [x] **Vitest Test Suite**: Verified 30 integration test cases covering search, synonym expansion, saved searches, watches, curated feeds, and stale job cleanups.

### Programmatic Verification Sequence
- [x] **Watch Creation & Match Alerts**: Verified that new job ingestion triggers alert creation for active watches, and disabled watches do not trigger alerts.
- [x] **Curated Feed & Tracker Exclusions**: Verified that feed queries rank watches and skills higher, and exclude jobs that have already been imported to the user's tracker.
- [x] **Batch Read Toggling**: Verified that marking all alerts as read marks them read in a single batch.
- [x] **Async URL Status Checks**: Verified that cleanup processes check active job links and deactivate 404/redirected jobs.
