# Advanced Job Search Engine Plan

> Scope: build with first-party code, public web pages, and low-cost infrastructure first.  
> Goal: add discovery, parsing, ranking, verification, alerts, and workflow tracking without relying on expensive third-party APIs.

## What We Can Build Without Paid APIs

### 1. Public job-source ingestion

We can ingest jobs from sources that expose public HTML pages, public RSS/Atom feeds, sitemap entries, or structured data on job pages.

Practical sources:

- Company career pages
- ATS-hosted job pages like Workday, Greenhouse, Lever, Ashby, SmartRecruiters, iCIMS, Taleo, Jobvite, JazzHR, BambooHR
- Government portals
- University, hospital, nonprofit, and association job boards
- Public job pages that include `JobPosting` structured data

What this gives us:

- Independent job discovery
- Broader coverage than only one paid board
- Better control over deduplication and ranking

### 2. Own crawler and fetch pipeline

We can build a crawler that:

- Fetches public job pages on a schedule
- Extracts job cards from listing pages
- Follows detail links
- Normalizes job data into our own schema
- Rechecks pages for updates and removals

Implementation choices:

- `fetch` or a lightweight HTTP client for HTML retrieval
- `cheerio` for DOM parsing
- `sitemap.xml` and `robots.txt` discovery
- Queue-based fetch workers with rate limiting and backoff
- Per-source crawl rules stored in config

### 3. Structured data extraction

Many job pages already expose useful machine-readable data.

We should extract, when available:

- Title
- Company
- Location
- Remote/hybrid/on-site status
- Employment type
- Salary or salary range
- Posted date
- Job description
- Required skills
- Experience level
- Apply URL

Strong first-pass extraction sources:

- JSON-LD `JobPosting`
- Microdata / RDFa
- HTML meta tags
- Visible listing cards

### 4. Own search index and ranking

We do not need a paid search API to build a useful search engine.

We can implement:

- Full-text search with MongoDB text indexes
- Fuzzy keyword matching
- Token normalization and synonym expansion
- Field boosting for title, company, skills, location, and freshness
- Boolean filters for remote, salary, date posted, job type, seniority, and source
- Relevance scoring controlled by our own ranking function

Useful ranking signals:

- Exact title match
- Skill overlap
- Recent posting date
- Salary transparency
- Source trust score
- Duplicate suppression
- Search history personalization

### 5. Deduplication and canonicalization

The same job often appears on multiple sources.

We can dedupe by:

- Canonical company name
- Normalized title
- Location
- Apply URL
- Title + company + location hash
- Similarity of description text

This can be done with:

- Deterministic hashing for exact matches
- Similarity scoring for near-duplicates
- Canonical source preference rules

### 6. Job freshness and verification

We can verify a listing without a paid API by:

- Checking the source page directly
- Comparing current HTML to a stored snapshot
- Watching for HTTP changes, redirects, or 404s
- Recording first-seen and last-seen timestamps
- Marking stale, expired, or removed postings

This also helps with scam and duplicate detection.

### 7. Search alerts and saved searches

We can build alerts ourselves using our indexed data.

Features:

- Saved search criteria
- Email digest
- Immediate alerts for high-match jobs
- “New since last visit” feed
- Watchlists for companies, titles, and locations

This is a strong feature because it uses our own data pipeline, not outside APIs.

### 8. User submissions and clipping

We can let users paste a URL or raw job text.

That enables:

- Manual save from any website
- One-click import from pasted description
- Resume tailoring from non-indexed jobs
- Community-curated sources later

### 9. Source trust and quality scoring

We can maintain our own metadata for each source:

- Crawl success rate
- Extraction quality
- Duplicate rate
- Freshness
- Spam or scam reports

That lets the engine rank trustworthy sources higher over time.

## What We Should Not Depend On Early

- Paid job aggregator APIs
- LinkedIn scraping
- Indeed scraping at scale
- Private search feeds that may change frequently
- Heavy LLM usage for every listing

The reason is simple: these are either costly, brittle, or likely to break due to access limits.

## Recommended Product Shape

The advanced search engine should behave like a pipeline with four layers:

1. Ingest jobs from public sources
2. Normalize and dedupe them
3. Index and rank them with our own logic
4. Let the user save, tailor, apply, and track inside JobTailor

## Low-Cost Feature Backlog

### Phase 1: Search foundation

- Job source registry
- Crawler for public company career pages
- `JobPosting` schema extraction
- Search index in MongoDB
- Filters for title, company, location, remote, date posted
- Duplicate detection

### Phase 2: Better relevance

- Synonym dictionary
- Skill and title expansion
- Source trust scoring
- Freshness boosting
- Query suggestions
- Saved searches

### Phase 3: Workflow integration

- Save to tracker
- Create application from search result
- Tailor resume from search result
- Email alerts for new matches
- “Hidden gems” recommendations

### Phase 4: Quality and safety

- Verification status
- Scam signals
- Dead link cleanup
- Source health dashboard
- User feedback on bad results

## Suggested Sprint Breakdown

### Sprint 1 [COMPLETE]
- Define the job ingestion schema & contract (`IJobIngestionInput`)
- Add a source registry model & deduplication layer (L1, L2, L3 check flow)
- Build a public crawler for HTML & JSON-LD `JobPosting` parsing
- Implement full-text indexing, pagination, filters, and trust/freshness boosting
- Expose saved-search creation and stale job cleanup deactivations

### Sprint 2 [COMPLETE]
- Implement user-aware personalized relevance boosts (profile skill overlap scoring)
- Support advanced minimum salary, employmentType, and location query filters
- Integrate regex synonym expansion with word boundaries `\b` to prevent substring collisions
- Expose update and delete saved search endpoints
- Add background Alert Dispatching on ingestion of brand new canonical jobs
- Expose Alert Inbox API endpoints (list unread match alerts, mark alert read)
- Build frontend Saved Alerts settings hub, Notifications inbox/bell dropdown, and relevance match badges

### Sprint 3 [PLANNED]
- **User Feed & Watch Workflows**:
  - Implement "watch company" and "watch title" configuration flows
  - Build user-facing personalized feeds (curated matching feed separate from alerts)
  - Refine alert lifecycle tracking and cleanup of old alerts
  - Polish saved-search management and subscription rules
  - Improve cleanup and validation checking for stale/dead canonical links

## Existing Repo Fit

Good news: the current repo already gives us a lot of the scaffolding we need.

Already present:

- Auth
- MongoDB models
- API layer
- React jobs page
- Tracker and application flow
- Resume tailoring and ATS scoring

What we need to add:

- New job source and ingestion models
- Search endpoints
- Ranking and dedupe services
- Scheduled crawl jobs
- Saved search/alert data model

## Recommended First Cut

The best low-cost first version is:

- Search across jobs imported from public job pages
- Let users paste URLs or descriptions
- Use our own ranking and dedupe
- Keep alerts and saved searches local to the product
- Only add paid APIs later if coverage or freshness really demands it

That gives us a useful search engine without turning the project into an API bill.

## Sprint 1 Execution Order

Do these in order. Do not jump to UI work before the ingestion and storage layer is stable.

### Step 1: lock the data model

Create shared types and server models for:

- `ISourceRegistry`
- `ICanonicalJob`
- `ISavedSearch`

Minimum fields to support Sprint 1:

- source name and source URL
- canonical title, company, and location
- raw text and normalized text
- `applyUrl`
- `firstSeenAt`, `lastSeenAt`, `isActive`
- dedupe key
- source trust score
- alert criteria for saved searches

### Step 2: add one source registry path

Support only two source types in Sprint 1:

- `manual_paste`
- `public_job_page`

Do not add more source types yet.

### Step 3: build ingestion service

Implement ingestion as a pure pipeline:

1. validate input
2. fetch or accept pasted text
3. extract fields
4. normalize fields
5. dedupe
6. persist canonical job

Extraction order:

1. JSON-LD `JobPosting`
2. visible page metadata
3. pasted/raw text fallback

### Step 4: add deduplication

Use this order of checks:

1. exact `applyUrl`
2. exact normalized `companyName + jobTitle + location`
3. normalized description hash

Keep the dedupe key on the canonical record so future imports resolve quickly.

### Step 5: add search endpoint

Expose one search endpoint that can query the canonical jobs collection.

Sprint 1 filters:

- query text
- location
- work type
- source
- freshness
- page and limit

Sprint 1 ranking:

- exact title match
- company match
- keyword overlap
- recent posting boost
- source trust boost

### Step 6: add saved searches

Implement only:

- create saved search
- list saved searches

Do not build alerts delivery yet unless the data model is already stable.

### Step 7: wire a minimal UI entry point

Keep UI changes small for Sprint 1:

- add a search tab or section
- add an import-from-URL form
- show search results
- show save-search action
- show import-to-tracker action

Do not redesign the entire Jobs page in this sprint.

### Step 8: add a background cleanup job

Add one scheduled maintenance task:

- mark stale jobs inactive after a freshness threshold

This is enough for Sprint 1. Source health dashboards can wait.

## Sprint 1 Acceptance Criteria

You are done only when all of these are true:

- A job can be ingested from a URL or pasted text
- JSON-LD `JobPosting` is extracted when present
- Duplicate imports collapse into one canonical job
- Canonical jobs can be searched and filtered
- Saved searches can be created and listed
- Results can be imported into the existing tracker flow
- Stale jobs can be marked inactive by a cleanup job

## Recommended Verification Sequence

Run verification in this order:

1. `npm run typecheck`
2. ingest one job from a public page with `JobPosting`
3. ingest the same job again and confirm dedupe
4. ingest one pasted job description
5. search by title and location
6. create a saved search
7. import one search result into the tracker
8. run the cleanup job and confirm stale status changes

## What To Leave Out Of Sprint 1

Do not spend time on these yet:

- LinkedIn or Indeed scraping
- LLM-based ranking
- advanced alerts delivery
- company follow graphs
- source health dashboards
- user feedback loops
- multi-source normalization rules for every ATS

Those belong in later sprints after the pipeline is trustworthy.
