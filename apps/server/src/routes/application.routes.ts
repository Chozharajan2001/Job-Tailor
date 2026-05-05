import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listApplications,
  getApplication,
  updateStatus,
  addNote,
  addReminder,
} from '../controllers/application.controller.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validation.js';

const router = Router();
router.use(authenticate);

// ─── Validation Schemas ────────────────────────────────────────
const idParamSchema = z.object({ id: z.string() });

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

const listQuery = z.object({
  status: z.enum(['saved', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn']).optional(),
});

// ─── Routes ────────────────────────────────────────────────────
router.get('/', validateQuery(listQuery), listApplications);
router.get('/:id', validateParams(idParamSchema), getApplication);
router.patch('/:id/status', validateParams(idParamSchema), validateBody(statusUpdateSchema), updateStatus);
router.post('/:id/notes', validateParams(idParamSchema), validateBody(noteSchema), addNote);
router.post('/:id/reminders', validateParams(idParamSchema), validateBody(reminderSchema), addReminder);

export default router;
