import { Router } from "express";
import { requireAdminKey } from "../middleware/admin-auth.js";
import {
  pollDueSourcesHandler,
  seedSourcesHandler,
} from "../controllers/admin.controller.js";

const router = Router();

// Every route below is behind the x-admin-key shared secret.
router.use(requireAdminKey);

router.post("/poll-due-sources", pollDueSourcesHandler);
router.post("/seed-sources", seedSourcesHandler);

export default router;
