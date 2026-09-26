import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.middleware.js";
import { validateBody, validateParams } from "../middleware/validation.js";
import {
  issueApiKey,
  listApiKeys,
  revokeApiKey,
} from "../controllers/apikey.controller.js";

const router = Router();
router.use(authenticate);

const idParamSchema = z.object({ id: z.string().length(24) });
const issueSchema = z.object({ name: z.string().min(1).max(80) });

router.post("/", validateBody(issueSchema), issueApiKey);
router.get("/", listApiKeys);
router.patch("/:id/revoke", validateParams(idParamSchema), revokeApiKey);

export default router;
