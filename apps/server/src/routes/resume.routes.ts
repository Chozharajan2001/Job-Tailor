import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware.js';
import { generateResume, listResumes, getResume, updateResume, downloadPDF, uploadResumePDF, getReusableResume, quickATSCheck, createProfileResume, updateProfileResume, getProfileResume, upload } from '../controllers/resume.controller.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validation.js';

const router = Router();
router.use(authenticate);

// ─── Validation Schemas ────────────────────────────────────────
const generateSchema = z.object({
  jobId: z.string().min(1, 'jobId is required'),
  options: z.object({
    rewriteSummary: z.boolean().default(true),
    reorderSections: z.boolean().default(true),
    maxBulletsPerRole: z.coerce.number().int().min(2).max(8).default(4),
    maxProjects: z.coerce.number().int().min(1).max(6).default(3),
  }).optional(),
});

const idParamSchema = z.object({ id: z.string() });
const listQuery = z.object({
  jobId: z.string().optional(),
});

const quickATSSchema = z.object({
  jobId: z.string().min(1, 'jobId is required'),
});

const createProfileResumeSchema = z.object({
  versionLabel: z.string().min(1, 'versionLabel is required'),
  tailoredSummary: z.string().optional(),
  skills: z.array(z.object({
    name: z.string(),
    category: z.string(),
    yearsOfExperience: z.number(),
    proficiency: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
    isHighlighted: z.boolean().default(false),
  })).optional(),
  experience: z.array(z.object({
    company: z.string(),
    role: z.string(),
    startDate: z.string(),
    endDate: z.string().nullable().optional(),
    location: z.string().optional(),
    isCurrentRole: z.boolean().default(false),
    description: z.string().optional(),
    bullets: z.array(z.object({
      id: z.string(),
      text: z.string(),
      tags: z.array(z.string()).optional(),
      usedInResumes: z.number().optional(),
    })).optional(),
  })).optional(),
  projects: z.array(z.object({
    name: z.string(),
    description: z.string(),
    techStack: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    link: z.string().optional(),
    github: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    highlights: z.array(z.string()).optional(),
  })).optional(),
  sectionOrder: z.array(z.string()).optional(),
  atsScore: z.object({
    overallScore: z.number(),
    keywordMatchScore: z.number(),
    semanticMatchScore: z.number(),
    sectionCompletenessScore: z.number(),
    formatScore: z.number(),
    breakdown: z.object({
      matchedSkills: z.array(z.any()),
      missingSkills: z.array(z.any()),
      weakSkills: z.array(z.any()),
      actionItems: z.array(z.string()),
    }),
  }).optional(),
});

const updateProfileResumeSchema = z.object({
  versionLabel: z.string().optional(),
  tailoredSummary: z.string().optional(),
  skills: z.array(z.any()).optional(),
  experience: z.array(z.any()).optional(),
  projects: z.array(z.any()).optional(),
  sectionOrder: z.array(z.string()).optional(),
  atsScore: z.object({}).optional(),
}).optional();

// ─── Routes ────────────────────────────────────────────────────
router.post('/generate', validateBody(generateSchema), generateResume);
router.get('/', validateQuery(listQuery), listResumes);

// Profile-based resume endpoints (must come before /:id)
router.post('/profile', validateBody(createProfileResumeSchema), createProfileResume);
router.get('/profile', getProfileResume);
router.put('/profile', validateBody(updateProfileResumeSchema), updateProfileResume);

router.get('/:id', validateParams(idParamSchema), getResume);
router.put('/:id', validateParams(idParamSchema), updateResume);

// PDF endpoints
router.post('/:id/pdf', validateParams(idParamSchema), downloadPDF);
router.post('/upload', upload.single('resume'), uploadResumePDF);
router.get('/reuse', getReusableResume);

// Quick ATS Check endpoint
router.post('/quick-ats-check', validateBody(quickATSSchema), quickATSCheck);

export default router;