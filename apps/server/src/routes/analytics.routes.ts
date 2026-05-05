import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware.js';
import * as analyticsController from '../controllers/analytics.controller.js';

const router = Router();
router.use(authenticate);

// ─── Routes ────────────────────────────────────────────────────
router.get('/overview', analyticsController.getOverview);
router.get('/resume-performance', analyticsController.getResumePerformance);
router.get('/status-breakdown', analyticsController.getStatusBreakdown);
router.get('/skill-gap-report', analyticsController.getSkillGapReport);

export default router;
