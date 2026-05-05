import { Router } from 'express';
const router = Router();

// Placeholder routes — to be implemented in Phase 2
router.post('/register', (_req, res) => {
  res.status(501).json({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Coming in Phase 2' } });
});

router.post('/login', (_req, res) => {
  res.status(501).json({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Coming in Phase 2' } });
});

export default router;
