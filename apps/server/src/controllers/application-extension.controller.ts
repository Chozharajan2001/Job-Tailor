import { Request, Response } from "express";
import { z } from "zod";
import { Application } from "../models/Application.model.js";
import { findOrCreateJob } from "../services/job-upsert.service.js";
import type { ApplicationDraft } from "../services/application-draft.types.js";

const draftSchema = z.object({
  platform: z.enum(["greenhouse", "lever", "ashby", "workday", "unknown"]),
  sourceUrl: z.string().url(),
  companyName: z.string().min(1).max(200),
  jobTitle: z.string().min(1).max(200),
  jdRawText: z.string().max(200000),
  detectedAt: z.string().datetime(),
});

/**
 * POST /api/v1/applications/from-extension
 *
 * Auth: `x-api-key` (see api-key-auth middleware mounted in app.ts).
 *
 * Body: a draft ApplicationDetected by the browser extension.
 *
 * Behaviour:
 *   1. Upsert the Job (URL first, then company+title within 60 days, then create).
 *   2. Look for an existing Application on (userId, jobId). If found, return
 *      it with `applicationCreated: false` (idempotent).
 *   3. Otherwise create the Application with status='applied' and a timeline
 *      event recording the platform + URL that produced it.
 *
 * Response: `{ success, data: { jobId, applicationId, jobCreated, applicationCreated } }`
 */
export async function createFromExtension(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = draftSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: {
        code: "INVALID_DRAFT",
        message: parsed.error.issues[0]?.message ?? "Invalid draft payload",
        details: parsed.error.issues,
      },
    });
    return;
  }
  const draftBody = parsed.data as ApplicationDraft;
  const userId = req.user!.userId;

  const { job, created: jobCreated } = await findOrCreateJob(userId, draftBody);

  const existing = await Application.findOne({ userId, jobId: job._id });
  if (existing) {
    res.json({
      success: true,
      data: {
        jobId: job._id,
        applicationId: existing._id,
        jobCreated,
        applicationCreated: false,
      },
    });
    return;
  }

  const application = await Application.create({
    userId,
    jobId: job._id,
    status: "applied",
    previousStatus: [],
    timelineEvents: [
      {
        event: "Application recorded via browser extension",
        description: `Detected on ${draftBody.platform} at ${draftBody.sourceUrl}`,
        eventDate: new Date(draftBody.detectedAt),
        type: "status_change",
      },
    ],
    reminders: [],
  });

  res.status(201).json({
    success: true,
    data: {
      jobId: job._id,
      applicationId: application._id,
      jobCreated,
      applicationCreated: true,
    },
  });
}
