# JobTailor — System Architecture Document

> Version 1.0 | Last Updated: 2026-05-05  
> Architect: Lead System Designer

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   React 18   │  │ TailwindCSS  │  │  shadcn/ui + Lucide  │  │
│  │   Vite+TS    │  │              │  │                      │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                 │                      │              │
│         └─────────────────┼──────────────────────┘              │
│                           ▼                                     │
│                   ┌──────────────┐                              │
│                   │  Zustand     │                              │
│                   │  TanStack Q  │                              │
│                   └──────┬───────┘                              │
└──────────────────────────┼─────────────────────────────────────┘
                           │ HTTPS / REST
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API GATEWAY                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Express.js + TypeScript                     │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌───────┐  │   │
│  │  │ Auth   │ │ Profile│ │  Jobs  │ │Resume │ │ ATS   │  │   │
│  │  │Routes  │ │ Routes │ │ Routes │ │ Routes│ │Engine │  │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └───────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                           │                                      │
│  ┌────────────────────────┼────────────────────────────────┐    │
│  │              Service Layer                               │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │    │
│  │  │ JD Parser│  │ Resume   │  │ ATS Score│  │ PDF Gen│  │    │
│  │  │ (LLM)    │  │ Tailor   │  │ Engine   │  │Service │  │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └────────┘  │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────────┼─────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
   ┌────────────┐  ┌────────────┐  ┌────────────┐
   │  MongoDB   │  │ Cloudinary │  │ OpenAI /   │
   │  Atlas     │  │   / S3     │  │ Claude API │
   └────────────┘  └────────────┘  └────────────┘
```

---

## 2. Monorepo Structure

```
job-tailor/
├── apps/
│   ├── client/                    # Frontend: React 18 + Vite + TypeScript
│   │   ├── src/
│   │   │   ├── components/        # Reusable UI components
│   │   │   │   ├── ui/           # shadcn/ui primitives
│   │   │   │   ├── layout/       # App shell, sidebar, navbar
│   │   │   │   ├── profile/      # Profile-related components
│   │   │   │   ├── jobs/         # Job ingestion & display
│   │   │   │   ├── resume/       # Resume editor & tailor
│   │   │   │   ├── tracker/      # Kanban tracker components
│   │   │   │   └── ats/          # ATS score & gap analysis
│   │   │   ├── pages/            # Route pages
│   │   │   ├── hooks/            # Custom React hooks
│   │   │   ├── stores/           # Zustand stores
│   │   │   ├── services/         # API client functions
│   │   │   ├── lib/              # Utilities, constants, helpers
│   │   │   ├── types/            # TypeScript type definitions
│   │   │   └── styles/           # Global CSS, tailwind config
│   │   ├── public/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   ├── tailwind.config.ts
│   │   └── package.json
│   │
│   └── server/                    # Backend: Express + TypeScript
│       ├── src/
│       │   ├── routes/            # Route handlers (grouped by domain)
│       │   │   ├── auth.routes.ts
│       │   │   ├── profile.routes.ts
│       │   │   ├── job.routes.ts
│       │   │   ├── resume.routes.ts
│       │   │   ├── application.routes.ts
│       │   │   └── analytics.routes.ts
│       │   ├── controllers/       # Request handling logic
│       │   ├── services/          # Business logic layer
│       │   │   ├── auth.service.ts
│       │   │   ├── jd-parser.service.ts
│       │   │   ├── resume-tailor.service.ts
│       │   │   ├── ats-scoring.service.ts
│       │   │   └── pdf-generator.service.ts
│       │   ├── models/            # Mongoose schemas
│       │   │   ├── User.model.ts
│       │   │   ├── Profile.model.ts
│       │   │   ├── Job.model.ts
│       │   │   ├── Resume.model.ts
│       │   │   └── Application.model.ts
│       │   ├── middleware/        # Express middleware
│       │   │   ├── auth.middleware.ts
│       │   │   ├── error-handler.ts
│       │   │   ├── validation.ts
│       │   │   └── rate-limiter.ts
│       │   ├── utils/             # Server-side utilities
│       │   ├── config/            # Environment config
│       │   │   ├── index.ts
│       │   │   └── database.ts
│       │   ├── types/             # Shared server types
│       │   └── app.ts             # Express app factory
│       ├── tests/
│       ├── tsconfig.json
│       └── package.json
│
├── packages/                      # Shared packages
│   ├── shared-types/              # Common TS types (shared client<->server)
│   ├── validations/               # Zod schemas (shared for client+server)
│   └── api-client/                # Typed fetch wrapper
│
├── docs/                          # Architecture, API docs
│   ├── architecture.md
│   ├── api-reference.md
│   ├── database-schema.md
│   └── development-guide.md
│
├── turbo.json                     # Turborepo configuration
├── package.json                   # Root workspace package.json
├── .gitignore
├── .env.example
├── README.md
└── LICENSE
```

---

## 3. Database Schema Design (MongoDB)

### 3.1 User Collection
```typescript
interface IUser {
  _id: ObjectId;
  email: string;
  passwordHash: string;           // bcrypt hash
  firstName: string;
  lastName: string;
  role: 'user' | 'admin';
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### 3.2 Profile Collection (Master Profile — one per user)
```typescript
interface IProfile {
  _id: ObjectId;
  userId: ObjectId;                // ref: User

  // Summary
  summary: string;                 // Professional summary (rewritten per JD)

  // Skills Inventory
  skills: ISkill[];

  // Experience Blocks
  experience: IExperience[];

  // Project Bank
  projects: IProject[];

  // Education
  education: IEducation[];

  // Certifications
  certifications: ICertification[];

  // Links
  links: {
    github?: string;
    linkedin?: string;
    portfolio?: string;
    website?: string;
  };

  // Metadata
  customSections?: Array<{
    title: string;
    content: string;
  }>;

  createdAt: Date;
  updatedAt: Date;
}

interface ISkill {
  name: string;                    // e.g., "React"
  category: 'frontend' | 'backend' | 'devops' | 'ai' | 'mobile' | 'database' | 'other';
  yearsOfExperience: number;       // 0-15+
  proficiency: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  isHighlighted: boolean;          // user pin
}

interface IExperience {
  company: string;
  role: string;
  startDate: string;               // ISO date
  endDate: string | null;          // null = current
  location: string;
  isCurrentRole: boolean;
  description: string;             // brief overview
  bullets: IBullet[];              // achievement bullets
}

interface IBullet {
  id: string;
  text: string;
  tags: ('frontend' | 'backend' | 'devops' | 'ai' | 'testing' | 'leadership')[];
  usedInResumes: number;           // tracking which resumes include this
}

interface IProject {
  name: string;
  description: string;
  techStack: string[];
  tags: ('frontend' | 'backend' | 'devops' | 'ai' | 'mobile')[];
  link?: string;
  github?: string;
  startDate: string;
  endDate?: string;
  highlights: string[];
}
```

### 3.3 Job Collection
```typescript
interface IJob {
  _id: ObjectId;
  userId: ObjectId;

  // Company Info
  companyName: string;
  jobTitle: string;
  jobLink?: string;                // original URL
  location: string;
  workType: 'remote' | 'hybrid' | 'onsite';
  employmentType: 'full-time' | 'part-time' | 'contract' | 'internship';
  salaryRange?: { min: number; max: number; currency: string };
  postedDate?: Date;

  // Raw JD
  jdRawText: string;

  // Parsed JD (LLM output)
  parsedJD: IParsedJD;

  // Status in pipeline
  status: 'saved' | 'applied' | 'screening' | 'interview' | 'offer' | 'rejected' | 'withdrawn';

  // Notes & follow-up
  notes: INote[];

  // Timestamps
  appliedDate?: Date;
  savedAt: Date;
  updatedAt: Date;
}

interface IParsedJD {
  summary: string;
  seniorityLevel: 'entry' | 'mid' | 'senior' | 'staff' | 'principal';
  focusWeights: {
    frontend: number;              // 0-100 percentage
    backend: number;
    devops: number;
    ai: number;
    mobile: number;
  };
  requiredSkills: string[];
  preferredSkills: string[];
  responsibilities: string[];
  qualifications: string[];
  niceToHaves: string[];
  tone: 'formal' | 'casual' | 'technical' | 'corporate';
}
```

### 3.4 Resume Collection
```typescript
interface IResume {
  _id: ObjectId;
  userId: ObjectId;
  jobId: ObjectId;                 // which job this was tailored for

  version: number;                  // auto-increment per job
  versionLabel: string;             // e.g., "Zoho_SDE2_Backend_v3"

  // Tailored Content
  tailoredSummary: string;
  skillIds: ObjectId[];             // selected/reordered from master profile
  experienceIds: ObjectId[];        // reordered bullets
  projectIds: ObjectId[];           // selected relevant projects

  // Ordering metadata
  sectionOrder: string[];            // e.g., ["skills","experience","projects","education"]

  // ATS Analysis
  atsScore: IATSScore;

  // Generated file
  pdfUrl?: string;

  // Status
  status: 'draft' | 'generated' | 'downloaded' | 'used';

  createdAt: Date;
  updatedAt: Date;
}
```

### 3.5 Application Collection (Tracker CRM)
```typescript
interface IApplication {
  _id: ObjectId;
  userId: ObjectId;
  jobId: ObjectId;
  resumeId: ObjectId;

  status: 'saved' | 'applied' | 'screening' | 'interview' | 'offer' | 'rejected' | 'withdrawn';
  previousStatus: string[];

  // Timeline events
  timelineEvents: ITimelineEvent[];

  // Follow-up reminders
  reminders: IReminder[];

  // Analytics flags
  callbackReceived: boolean;
  rejectedReason?: string;

  createdAt: Date;
  updatedAt: Date;
}

interface ITimelineEvent {
  _id: ObjectId;
  event: string;
  description: string;
  eventDate: Date;
  type: 'status_change' | 'note' | 'reminder' | 'follow_up' | 'interview_schedule';
}

interface IReminder {
  _id: ObjectId;
  message: string;
  dueDate: date;
  isCompleted: boolean;
  completedAt?: Date;
}
```

### 3.6 ATS Score Sub-document
```typescript
interface IATSScore {
  overallScore: number;            // 0-100
  keywordMatchScore: number;       // TF-IDF based
  semanticMatchScore: number;      // LLM similarity
  sectionCompletenessScore: number;
  formatScore: number;

  breakdown: {
    matchedSkills: IMatchedSkill[];
    missingSkills: IMissingSkill[];
    weakSkills: IWeakSkill[];
    actionItems: string[];
  };
}

interface IMatchedSkill {
  skill: string;
  presentInResume: boolean;
  presentInJD: boolean;
  weight: number;
}

interface IMissingSkill {
  skill: string;
  required: boolean;               // must-have vs nice-to-have
  suggestion: string;
}

interface IWeakSkill {
  skill: string;
  userYearsExp: number;
  requiredYearsExp: number;
  gap: number;                      // years gap
  suggestion: string;
}
```

---

## 4. REST API Contract

### Base URL: `/api/v1`

### 4.1 Auth Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login, returns JWT |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Invalidate session |
| GET | `/auth/me` | Get current user profile |

### 4.2 Profile Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/profile` | Get master profile |
| PUT | `/profile` | Update entire profile |
| PATCH | `/profile/summary` | Update summary only |
| POST | `/profile/skills` | Add a skill |
| PUT | `/profile/skills/:id` | Update a skill |
| DELETE | `/profile/skills/:id` | Remove a skill |
| POST | `/profile/experience` | Add experience block |
| PUT | `/profile/experience/:id` | Update experience |
| DELETE | `/profile/experience/:id` | Remove experience |
| POST | `/profile/projects` | Add project |
| PUT | `/profile/projects/:id` | Update project |
| DELETE | `/profile/projects/:id` | Remove project |

### 4.3 Job Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/jobs` | Create job entry (with JD text) |
| GET | `/jobs` | List all jobs (filterable) |
| GET | `/jobs/:id` | Get job detail with parsed JD |
| PUT | `/jobs/:id` | Update job info |
| DELETE | `/jobs/:id` | Delete job |
| POST | `/jobs/:id/parse` | Trigger LLM JD parsing |
| GET | `/jobs/:id/parsed` | Get parsed JD result |

### 4.4 Resume Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/resumes/generate` | Auto-generate tailored resume for a job |
| GET | `/resumes?jobId=:id` | List resumes for a job |
| GET | `/resumes/:id` | Get resume detail |
| PUT | `/resumes/:id` | Manually edit generated resume |
| GET | `/resumes/:id/pdf` | Generate & get PDF download URL |
| POST | `/resumes/:id/regenerate` | Regenerate with different settings |

### 4.5 Application Tracker Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/applications` | List applications (Kanban data) |
| GET | `/applications/:id` | Get application detail |
| PATCH | `/applications/:id/status` | Update application status |
| POST | `/applications/:id/notes` | Add note to application |
| POST | `/applications/:id/reminders` | Add reminder |
| PATCH | `/applications/:id/reminders/:reminderId` | Complete reminder |
| POST | `/applications/:id/timeline` | Add timeline event |

### 4.6 Analytics Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/analytics/overview` | Dashboard stats overview |
| GET | `/analytics/resume-performance` | Resume version performance comparison |
| GET | `/analytics/status-breakdown` | Pipeline funnel data |
| GET | `/analytics/skill-gap-report` | Aggregate skill gap report across all JDs |

---

## 5. Component Architecture (Frontend)

```
App
├── AuthProvider (JWT context)
├── QueryProvider (TanStack Query)
├── ThemeProvider
│
├── Layout
│   ├── Sidebar
│   │   ├── Logo
│   │   ├── Navigation Links
│   │   └── UserMenu
│   ├── TopBar
│   │   ├── SearchBar
│   │   ├── Notifications
│   │   └── AvatarDropdown
│   └── MainContent (Outlet)
│
├── Pages
│   ├── LoginPage
│   ├── RegisterPage
│   ├── DashboardPage
│   │   ├── StatsCardsRow
│   │   ├── RecentActivityFeed
│   │   └── QuickActionsGrid
│   ├── ProfilePage
│   │   ├── ProfileForm
│   │   │   ├── SummaryEditor
│   │   │   ├── SkillInventory (CRUD with tags)
│   │   │   ├── ExperienceBlocks
│   │   │   ├── ProjectBank
│   │   │   └── EducationSection
│   │   └── ProfilePreview
│   ├── JobsPage
│   │   ├── JobList (filterable/sortable)
│   │   ├── JDPasteModal
│   │   └── JobDetailPanel (parsed view)
│   ├── ResumeTailorPage
│   │   ├── JobSelector
│   │   ├── ATSDashboard
│   │   │   ├── ScoreGauge
│   │   │   ├── MatchedSkillsTable
│   │   │   ├── MissingSkillsTable
│   │   │   ├── WeaknessBox
│   │   │   └── ActionItemsList
│   │   ├── ResumeEditor (live preview)
│   │   └── ExportButton
│   ├── TrackerPage
│   │   ├── KanbanBoard
│   │   │   ├── KanbanColumn × 6
│   │   │   └── ApplicationCard (draggable)
│   │   ├── ApplicationDetailModal
│   │   │   ├── TabPanel: JD View
│   │   │   ├── TabPanel: Resume View
│   │   │   ├── TabPanel: Timeline
│   │   │   └── TabPanel: Notes
│   │   └── FiltersBar
│   ├── InterviewModePage
│   │   └── SplitView
│   │       ├── LeftPanel: JD
│   │       └── RightPanel: Resume
│   └── AnalyticsPage
│       ├── FunnelChart
│       ├── SuccessRateByResume
│       ├── SkillGapHeatmap
│       └── TimeToResponseChart
│
└── Modals/Overlays
    ├── ConfirmDialog
    ├── AddNoteModal
    ├── SetReminderModal
    └── ShareModal
```

---

## 6. State Management Strategy

| Data Type | Tool | Rationale |
|-----------|------|-----------|
| User auth state | Zustand | Global, simple, needs no caching |
| UI preferences (theme, sidebar state) | Zustand | Client-only, ephemeral |
| Profile data | TanStack Query | Fetched from API, needs cache/invalidation |
| Jobs list & detail | TanStack Query | Server state, pagination, filtering |
| Resumes | TanStack Query | Derived from server, cached per job |
| Kanban board state | Zustand (optimistic) + TanStack | Drag updates optimistically, sync to server |
| Form draft states | React state or Zustand | Local component scope |

---

## 7. Authentication Flow

```
Client                          Server                    MongoDB
  │                               │                         │
  ├── POST /auth/register ──────>│                         │
  │                               ├── Hash password (bcrypt)│
  │                               ├── Create user document ─>
  │                               ├── Generate JWT tokens   │
  │                               │                         │
  │<── Access + Refresh token ──│                         │
  │                               │                         │
  ├── POST /api/jobs (JWT) ─────>│                         │
  │                               ├── Verify JWT ──────────>│
  │                               │<── User found ─────────│
  │                               ├── Process request      │
  │<── Response ─────────────────│                         │
```

**Token Strategy**: 
- **Access Token**: 15min expiry, HTTP-only cookie or Authorization header
- **Refresh Token**: 7 days expiry, stored in http-only cookie, rotated on refresh
- **Middleware**: `auth.middleware.ts` validates token on protected routes

---

## 8. LLM Integration Design (JD Parsing + Resume Tailoring)

### 8.1 JD Parser Service
```
Input: Raw JD text (string)
Output: Structured IParsedJD JSON
Model: GPT-4o-mini (cost-effective) or Claude Haiku
Prompt Strategy: Few-shot JSON mode with schema enforcement
Fallback: If LLM fails → regex-based extraction for common patterns
Caching: Hash JD text → cache parsed result for 24h
```

### 8.2 Resume Tailor Service
```
Input: Master Profile + Parsed JD
Output: Tailored resume content (reordered sections, rewritten summary, selected bullets/projects)
Strategy:
  1. Compute skill overlap between profile and JD
  2. Rank experiences by relevance to JD focus weights
  3. Select top N most relevant projects
  4. LLM rewrites summary using JD keywords and tone
  5. Reorder bullets: matching tags first
  6. Return structured content + confidence score
```

### 8.3 ATS Scoring Engine (Hybrid)
```
Phase 1 - Keyword Scoring (TF-IDF):
  - Extract keywords from JD (skills, tools, technologies)
  - Check presence in each resume section
  - Weight by section: skills(30%), exp(25%), projects(20%), summary(15%), edu(10%)

Phase 2 - Semantic Matching (LLM):
  - Send resume + JD to LLM with scoring rubric
  - Returns: overall score + reasoning

Phase 3 - Format Scoring:
  - Section completeness check
  - Bullet quantification check (numbers/metrics detection)
  - Length appropriateness

Final Score = (Keyword * 0.35) + (Semantic * 0.45) + (Format * 0.20)
```

---

## 9. PDF Generation Strategy

**Approach**: Server-side Puppeteer rendering
1. Create an HTML template from tailored resume data
2. Style with print-optimized CSS
3. Puppeteer renders HTML → PDF buffer
4. Upload to Cloudinary/S3 → return download URL

Alternative (V2): Client-side `@react-pdf/renderer` for lighter server load.

---

## 10. Deployment Architecture

```
┌─────────────────────────────────────────┐
│            Production (Vercel + Render)  │
│                                         │
│  ┌─────────────┐    ┌────────────────┐  │
│  │   Vercel    │    │    Render      │  │
│  │  (Frontend) │◄──►│  (Backend API) │  │
│  │  React+Vite │    │  Express+TS    │  │
│  └──────┬──────┘    └───────┬────────┘  │
│         │                   │            │
│         │     CDN           │            │
│         ▼                   ▼            │
│  ┌─────────────┐    ┌────────────────┐  │
│  │  Cloudinary │    │ MongoDB Atlas  │  │
│  │  (PDF/Files)│    │  (Database)    │  │
│  └─────────────┘    └────────────────┘  │
│                                         │
│  External APIs: OpenAI/Claude (LLM)     │
└─────────────────────────────────────────┘
```

---

## 11. Environment Variables

```env
# Server (.env)
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb+srv://...
JWT_SECRET=<generated-secret>
JWT_REFRESH_SECRET=<generated-secret>
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
BCRYPT_ROUNDS=12
CORS_ORIGIN=http://localhost:5173

# LLM API (choose one or both)
OPENAI_API_KEY=sk-...
CLAUDE_API_KEY=sk-...

# File Storage
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

# Client (.env.client)
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

---

## 12. Development Phases Summary

| Phase | Focus | Duration | Deliverable |
|-------|-------|----------|-------------|
| 0 | Architecture Design | Day 1 | This doc, DB schema, API contracts |
| 1 | Project Scaffold | Day 1 | Turborepo, configs, Git, README |
| 2 | Backend Foundation | Days 2-3 | Express server, MongoDB, Auth, base routes |
| 3 | Core Models + APIs | Days 4-5 | All Mongoose models, CRUD, JD parser, ATS engine |
| 4 | Frontend Shell | Days 5-6 | Vite+React setup, routing, layout, auth UI |
| 5 | Dashboard + Profile | Days 7-8 | Master profile form, skills, experience, projects |
| 6 | Job Ingestion + Tailor | Days 9-10 | JD paste, parse display, tailor UI, ATS dashboard |
| 7 | Application Tracker | Days 11-12 | Kanban board, cards, notes, reminders |
| 8: PDF + Interview Mode | Days 13-14 | PDF generation, split-screen interview view |
| 9: Polish + Deploy | Days 15-16 | Error handling, loading states, deployment configs |
