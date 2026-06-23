import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  createApplication,
  listApplications,
  getApplication,
  updateStatus,
  addNote,
  addReminder,
  deleteApplication,
  recordOutcome,
  completeReminder,
} from '../controllers/application.controller.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validation.js';

const router = Router();
router.use(authenticate);

// ─── Validation Schemas ────────────────────────────────────────
const idParamSchema = z.object({ id: z.string() });
const idRidParamSchema = z.object({ id: z.string(), rid: z.string() });

const createApplicationSchema = z.object({
  jobId: z.string().min(1, 'jobId is required'),
  resumeId: z.string().optional(),
  status: z.enum(['saved', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn']).default('applied'),
  appliedDate: z.string().datetime().optional(),
});

const statusUpdateSchema = z.object({
  status: z.enum(['saved', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn']),
  note: z.string().optional(),
});

const noteSchema = z.object({
  content: z.string().min(1, 'Note content cannot be empty'),
});

const reminderSchema = z.object({
  message: z.string().min(1, 'Reminder message is required'),
  dueDate: z.string().datetime('Invalid date format'),
});

const outcomeSchema = z.object({
  callbackReceived: z.boolean().optional(),
  rejectedReason: z.string().optional(),
  offerAmount: z.string().optional(),
}).refine(
  (d) => d.callbackReceived !== undefined || d.rejectedReason !== undefined || d.offerAmount !== undefined,
  { message: 'At least one outcome field is required.' }
);

const listQuery = z.object({
  status: z.enum(['saved', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn']).optional(),
});

// ─── Routes ────────────────────────────────────────────────────
router.post('/', validateBody(createApplicationSchema), createApplication);
router.get('/', validateQuery(listQuery), listApplications);
router.get('/:id', validateParams(idParamSchema), getApplication);
router.patch('/:id/status', validateParams(idParamSchema), validateBody(statusUpdateSchema), updateStatus);
router.post('/:id/notes', validateParams(idParamSchema), validateBody(noteSchema), addNote);
router.post('/:id/reminders', validateParams(idParamSchema), validateBody(reminderSchema), addReminder);
router.patch('/:id/outcome', validateParams(idParamSchema), validateBody(outcomeSchema), recordOutcome);
router.patch('/:id/reminders/:rid/complete', validateParams(idRidParamSchema), completeReminder);
router.delete('/:id', validateParams(idParamSchema), deleteApplication);

export default router;