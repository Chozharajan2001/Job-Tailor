import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAdminKey } from "../middleware/admin-auth.js";
import {
  pollDueSourcesHandler,
  seedSourcesHandler,
} from "../controllers/admin.controller.js";

const router = Router();

/**
 * The scheduled poller calls this route a couple of times a day, so a tight
 * per-minute limit costs nothing legitimate and turns an unbounded x-admin-key
 * brute force into ~10 guesses a minute per client.
 */
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: {
      code: "ADMIN_RATE_LIMITED",
      message: "Too many admin attempts, please try again later.",
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(adminLimiter);

// Every route below is behind the x-admin-key shared secret.
router.use(requireAdminKey);

router.post("/poll-due-sources", pollDueSourcesHandler);
router.post("/seed-sources", seedSourcesHandler);

export default router;
