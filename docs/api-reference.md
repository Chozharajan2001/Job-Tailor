# JobTailor — API Reference

> Base URL: `/api/v1` | Authentication: Bearer Token (JWT)  
> All timestamps in **ISO 8601** format.

---

## 1. Authentication

### POST `/auth/register`
Register a new user account.

**Request:**
```json
{
  "email": "arjun@example.com",
  "password": "SecurePass123!",
  "firstName": "Arjun",
  "lastName": "Kumar"
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "user": { "_id": "...", "email": "arjun@example.com", "firstName": "Arjun", "lastName": "Kumar" },
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci..."
  }
}
```

**Errors:** `400` (validation), `409` (email exists)

---

### POST `/auth/login`
Authenticate and receive tokens.

**Request:**
```json
{ "email": "arjun@example.com", "password": "SecurePass123!" }
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "user": { "_id": "...", "email": "...", "firstName": "Arjun" },
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci..."
  }
}
```

**Errors:** `401` (invalid credentials)

---

### GET `/auth/me`
Get currently authenticated user profile.

**Headers:** `Authorization: Bearer <token>`

**Response 200:**
```json
{ "success": true, "data": { "user": { "_id": "...", "email": "...", ... } } }
```

---

## 2. Master Profile

### GET `/profile`
Retrieve full master profile with all nested data.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "profile": {
      "_id": "...",
      "summary": "Full-stack developer with 2+ YOE...",
      "skills": [
        { "_id": "...", "name": "React", "category": "frontend", "yearsOfExperience": 2.5, "proficiency": "advanced" }
      ],
      "experience": [ { /* experience block */ } ],
      "projects": [ { /* project block */ } ],
      "education": [ { /* education */ } ],
      "links": { "github": "...", "linkedin": "..." }
    }
  }
}
```

---

### PUT `/profile`
Replace entire profile (full update).

**Request:** Same structure as GET response body (omit `_id`, `createdAt`).

---

### POST `/profile/skills`
Add a new skill to inventory.

**Request:**
```json
{
  "name": "Docker",
  "category": "devops",
  "yearsOfExperience": 0.5,
  "proficiency": "beginner",
  "isHighlighted": false
}
```

**Response 201:** `{ "success": true, "data": { "skill": { "_id": "...", "name": "Docker", ... } } }`

---

### PUT `/profile/experience/:id`
Update an existing experience block.

**Request:**
```json
{
  "company": "Freshworks",
  "role": "SDE-2",
  "startDate": "2024-03",
  "endDate": null,
  "isCurrentRole": true,
  "bullets": [
    { "text": "Built microservice handling 10k requests/sec", "tags": ["backend"] }
  ]
}
```

---

### POST `/profile/projects`
Add a new project to bank.

**Request:**
```json
{
  "name": "JobTailor",
  "description": "Smart resume tailor application",
  "techStack": ["React", "Node.js", "MongoDB", "OpenAI"],
  "tags": ["frontend", "backend", "ai"],
  "link": "https://jobtailor.app",
  "highlights": ["ATS scoring engine", "LLM-powered JD parsing"]
}
```

---

## 3. Jobs (JD Ingestion)

### POST `/jobs`
Create a new job entry with JD text for parsing.

**Request:**
```json
{
  "companyName": "Zoho",
  "jobTitle": "Senior Backend Developer",
  "jobLink": "https://careers.zoho.com/jobs/123",
  "location": "Chennai / Remote",
  "workType": "hybrid",
  "employmentType": "full-time",
  "jdRawText": "We are looking for an experienced backend developer...\nRequirements:\n- 5+ years Node.js\n- MongoDB experience\n- AWS knowledge preferred..."
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "job": {
      "_id": "...",
      "companyName": "Zoho",
      "jobTitle": "Senior Backend Developer",
      "status": "saved",
      "parsedJD": null,
      "savedAt": "2026-05-05T10:00:00Z"
    }
  }
}
```

---

### GET `/jobs?status=saved&page=1&limit=20&search=backend`
List jobs with filtering, pagination, search.

**Query Params:**
| Param | Type | Description |
|-------|------|-------------|
| status | string | Filter by pipeline status |
| page | number | Page number (default: 1) |
| limit | number | Items per page (default: 20) |
| search | string | Search across company/title |
| sortBy | string | `date`, `company`, `atsScore` |
| sortOrder | string | `asc`, `desc` |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "jobs": [...],
    "pagination": { "total": 42, "page": 1, "pages": 3, "limit": 20 }
  }
}
```

---

### POST `/jobs/:id/parse`
Trigger LLM to parse raw JD text into structured format.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "parsedJD": {
      "summary": "Looking for senior backend dev focused on distributed systems",
      "seniorityLevel": "senior",
      "focusWeights": { "backend": 80, "devops": 15, "frontend": 5, "ai": 0, "mobile": 0 },
      "requiredSkills": ["Node.js", "Express", "MongoDB", "AWS"],
      "preferredSkills": ["Docker", "Kubernetes", "Redis"],
      "responsibilities": [...],
      "qualifications": [...],
      "niceToHaves": [...]
    }
  }
}
```

**Async note:** For heavy JDs, this may return `202 Accepted` with a job ID for polling.

---

## 4. Resume Generation & Tailoring

### POST `/resumes/generate`
Generate a tailored resume from master profile for a specific job.

**Request:**
```json
{
  "jobId": "<job ObjectId>",
  "options": {
    "rewriteSummary": true,
    "reorderSections": true,
    "maxBulletsPerRole": 4,
    "maxProjects": 3,
    "toneMatch": true
  }
}
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "resume": {
      "_id": "...",
      "version": 1,
      "versionLabel": "Zoho_SeniorBackendDev_v1.pdf",
      "tailoredSummary": "Senior Backend Developer with 2+ years building...",
      "atsScore": {
        "overallScore": 82,
        "keywordMatchScore": 78,
        "semanticMatchScore": 85,
        "sectionCompletenessScore": 90,
        "formatScore": 75,
        "breakdown": {
          "matchedSkills": [{ "skill": "React", "presentInResume": true, "presentInJD": false, "weight": 0 }],
          "missingSkills": [{ "skill": "AWS", "required": true, "suggestion": "Consider adding S3/Lambda project" }],
          "weakSkills": [{ "skill": "Docker", "userYearsExp": 0.5, "requiredYearsExp": 2, "gap": 1.5, "suggestion": "..." }],
          "actionItems": ["Add AWS S3 project to hit 90% ATS score"]
        }
      },
      "sectionOrder": ["skills", "experience", "projects", "education"],
      "status": "generated"
    }
  }
}
```

---

### GET `/resumes/:id/pdf`
Generate PDF and return download URL.

**Response 200:**
```json
{ "success": true, "data": { "pdfUrl": "https://res.cloudinary.com/.../v1/..." } }
```

---

## 5. Application Tracker

### GET `/applications?status=applied`
Get applications grouped by status (for Kanban board).

**Query Params:** same as jobs + optional `groupBy=status`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "applications": [
      {
        "_id": "...",
        "jobId": { "companyName": "Zoho", "jobTitle": "SDE-2" },
        "resumeId": { "versionLabel": "Zoho_SDE2_v2", "atsScore": 85 },
        "status": "applied",
        "appliedDate": "2026-05-01T10:00:00Z",
        "timelineEvents": [...],
        "reminders": [...]
      }
    ]
  }
}
```

---

### PATCH `/applications/:id/status`
Move application through pipeline stages.

**Request:**
```json
{ "status": "interview", "note": "Recruiter called, scheduled for Monday" }
```

---

### POST `/applications/:id/reminders`
Set a follow-up reminder.

**Request:**
```json
{ "message": "Follow up with TCS recruiter", "dueDate": "2026-05-12T09:00:00Z" }
```

---

## 6. Analytics

### GET `/analytics/overview`
Dashboard statistics.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "totalApplications": 47,
    "thisWeekApplied": 8,
    "interviewRate": 0.23,
    "averageATSScore": 78,
    "topMatchingSkills": ["React", "TypeScript", "Node.js"],
    "commonGaps": ["AWS", "Kubernetes", "GraphQL"],
    "pipelineFunnel": { "saved": 12, "applied": 20, "screening": 7, "interview": 5, "offer": 2, "rejected": 6 },
    "resumePerformance": [
      { "versionLabel": "Backend-focused", "usageCount": 15, "callbackRate": 0.27 },
      { "versionLabel": "AI-focused", "usageCount": 8, "callbackRate": 0.12 }
    ]
  }
}
```

---

## Error Response Format

All errors follow this consistent structure:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid email format",
    "details": [{ "field": "email", "message": "Must be a valid email address" }]
  },
  "statusCode": 400
}
```

### HTTP Status Codes
| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (no permission) |
| 404 | Not Found |
| 409 | Conflict (duplicate resource) |
| 422 | Unprocessable (logic error) |
| 429 | Too Many Requests (rate limited) |
| 500 | Internal Server Error |
