import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getProfile,
  updateProfile,
  addSkill,
  updateSkill,
  deleteSkill,
  addExperience,
  updateExperience,
  deleteExperience,
  addProject,
  updateProject,
  deleteProject,
  uploadAndPopulateProfile,
  addEducation,
  updateEducation,
  deleteEducation,
  addCertification,
  updateCertification,
  deleteCertification,
} from '../controllers/profile.controller.js';
import { upload } from '../controllers/resume.controller.js';
import { validateBody } from '../middleware/validation.js';
import { z } from 'zod';

const router = Router();

// All profile routes require authentication
router.use(authenticate);

// ─── Profile CRUD ──────────────────────────────────────────────
router.get('/', getProfile);
router.put('/', validateBody(z.object({ summary: z.string().optional(), links: z.record(z.string()).optional() }).partial()), updateProfile);
router.post('/upload', upload.single('resume'), uploadAndPopulateProfile);

// ─── Skills ────────────────────────────────────────────────────
router.post('/skills', validateBody(z.object({
  name: z.string().min(1),
  category: z.enum(['frontend', 'backend', 'devops', 'ai', 'mobile', 'database', 'other']),
  yearsOfExperience: z.number().min(0).max(50),
  proficiency: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
  isHighlighted: z.boolean().default(false),
})), addSkill);
router.put('/skills/:id', validateBody(z.object({}).partial()), updateSkill);
router.delete('/skills/:id', deleteSkill);

// ─── Experience ────────────────────────────────────────────────
router.post('/experience', validateBody(z.object({
  company: z.string().min(1), role: z.string().min(1), startDate: z.string(),
  endDate: z.string().nullable(), location: z.string(),
  isCurrentRole: z.boolean(), description: z.string().optional(),
  bullets: z.array(z.object({
    id: z.string(), text: z.string(),
    tags: z.array(z.enum(['frontend', 'backend', 'devops', 'ai', 'testing', 'leadership'])),
  })),
})), addExperience);
router.put('/experience/:id', validateBody(z.object({}).partial()), updateExperience);
router.delete('/experience/:id', deleteExperience);

// ─── Projects ─────────────────────────────────────────────────
router.post('/projects', validateBody(z.object({
  name: z.string().min(1), description: z.string().min(1),
  techStack: z.array(z.string()),
  tags: z.array(z.enum(['frontend', 'backend', 'devops', 'ai', 'mobile'])),
  link: z.string().optional(), github: z.string().optional(),
  startDate: z.string(), endDate: z.string().optional(),
  highlights: z.array(z.string()),
})), addProject);
router.put('/projects/:id', validateBody(z.object({}).partial()), updateProject);
router.delete('/projects/:id', deleteProject);

// ─── Education ────────────────────────────────────────────────
router.post('/education', validateBody(z.object({
  institution: z.string().min(1),
  degree: z.string().min(1),
  field: z.string().min(1),
  startYear: z.number().min(1980).max(2035),
  endYear: z.number().min(1980).max(2035).optional(),
  gpa: z.string().optional(),
})), addEducation);
router.put('/education/:id', validateBody(z.object({
  institution: z.string().optional(),
  degree: z.string().optional(),
  field: z.string().optional(),
  startYear: z.number().min(1980).max(2035).optional(),
  endYear: z.number().min(1980).max(2035).optional(),
  gpa: z.string().optional(),
}).partial()), updateEducation);
router.delete('/education/:id', deleteEducation);

// ─── Certifications ───────────────────────────────────────────
router.post('/certifications', validateBody(z.object({
  name: z.string().min(1),
  issuer: z.string().min(1),
  date: z.string(),
  credentialUrl: z.string().optional(),
})), addCertification);
router.put('/certifications/:id', validateBody(z.object({
  name: z.string().optional(),
  issuer: z.string().optional(),
  date: z.string().optional(),
  credentialUrl: z.string().optional(),
}).partial()), updateCertification);
router.delete('/certifications/:id', deleteCertification);

export default router;
