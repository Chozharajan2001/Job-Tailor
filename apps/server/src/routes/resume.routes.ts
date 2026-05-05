import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware.js';
import { generateResume, listResumes, getResume, updateResume } from '../controllers/resume.controller.js';
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

// ─── Routes ────────────────────────────────────────────────────
router.post('/generate', validateBody(generateSchema), generateResume);
router.get('/', validateQuery(listQuery), listResumes);
router.get('/:id', validateParams(idParamSchema), getResume);
router.put('/:id', validateParams(idParamSchema), updateResume);

export default router;
