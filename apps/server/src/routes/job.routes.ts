import { Router } from 'express';
const router = Router();

// Placeholder routes — to be implemented in Phase 3
router.post('/', (_req, res) => {
  res.status(501).json({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Coming in Phase 3' } });
});

router.get('/', (_req, res) => {
  res.status(501).json({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Coming in Phase 3' } });
});

export default router;
