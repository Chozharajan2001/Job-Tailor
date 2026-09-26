import { Job, IJob } from "../models/Job.model.js";
import type { ApplicationDraft } from "./application-draft.types.js";

/**
 * Idempotent job resolution for extension-detected applications.
 *
 *   1. Primary — exact `jobLink` match for this user → reuse
 *   2. Secondary — same company + jobTitle within the last 60 days → reuse
 *      and log a warning so the user can inspect why the URL didn't match
 *      (extension users often re-visit the same role from a slightly
 *      different URL)
 *   3. Fallback — create a fresh Job with `jobLink = draft.sourceUrl`
 *
 * No new Job fields are introduced. Provenance ("via browser extension")
 * belongs on the Application's timeline event, not on the Job schema.
 */
export async function findOrCreateJob(
  userId: string,
  draft: ApplicationDraft,
): Promise<{ job: IJob; created: boolean }> {
  const byUrl = await Job.findOne({ userId, jobLink: draft.sourceUrl });
  if (byUrl) return { job: byUrl, created: false };

  const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const byTitle = await Job.findOne({
    userId,
    companyName: {
      $regex: new RegExp(`^${escapeRegex(draft.companyName)}$`, "i"),
    },
    jobTitle: { $regex: new RegExp(`^${escapeRegex(draft.jobTitle)}$`, "i") },
    createdAt: { $gte: cutoff },
  });
  if (byTitle) {
    console.warn(
      `job-upsert: matched existing Job ${byTitle._id} by company+title (not URL). ` +
        `Draft URL ${draft.sourceUrl} differs from stored jobLink ${byTitle.jobLink}.`,
    );
    return { job: byTitle, created: false };
  }

  const created = await Job.create({
    userId,
    companyName: draft.companyName,
    jobTitle: draft.jobTitle,
    jdRawText: draft.jdRawText,
    jobLink: draft.sourceUrl,
  });
  return { job: created, created: true };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
