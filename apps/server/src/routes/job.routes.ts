import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  createJob,
  listJobs,
  getJob,
  updateJob,
  deleteJob,
  parseJobJD,
  attachResumeToJob,
} from '../controllers/job.controller.js';
import { validateBody, validateQuery, validateParams } from '../middleware/validation.js';

const router = Router();
router.use(authenticate);

// ─── Validation Schemas ────────────────────────────────────────
const jobCreateSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  jobTitle: z.string().min(1, 'Job title is required'),
  jobLink: z.string().url().optional(),
  location: z.string().optional().default('remote'),
  workType: z.enum(['remote', 'hybrid', 'onsite']).default('remote'),
  employmentType: z.enum(['full-time', 'part-time', 'contract', 'internship']).default('full-time'),
  salaryRange: z.object({ min: z.number(), max: z.number(), currency: z.string() }).optional(),
  postedDate: z.string().datetime().optional(),
  jdRawText: z.string().min(10, 'JD text must be at least 10 characters'),
  attachedResumeId: z.string().optional(),
});

const idParamSchema = z.object({ id: z.string() });

const jobListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['saved', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn']).optional(),
  search: z.string().trim().optional(),
  sortBy: z.enum(['date', 'company']).default('date'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const attachResumeSchema = z.object({
  resumeId: z.string().min(1, 'resumeId is required'),
});

// ─── Routes ────────────────────────────────────────────────────
router.post('/', validateBody(jobCreateSchema), createJob);
router.get('/', validateQuery(jobListQuery), listJobs);
router.get('/:id', validateParams(idParamSchema), getJob);
router.put('/:id', validateParams(idParamSchema), updateJob);
router.delete('/:id', validateParams(idParamSchema), deleteJob);
router.post('/:id/parse', validateParams(idParamSchema), parseJobJD);
router.patch('/:id/attach-resume', validateParams(idParamSchema), validateBody(attachResumeSchema), attachResumeToJob);

export default router;