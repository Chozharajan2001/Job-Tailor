import { Router } from 'express';
const router = Router();

// Placeholder routes — to be implemented in Phase 7
router.get('/overview', (_req, res) => {
  res.status(501).json({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Coming in Phase 7' } });
});

export default router;
