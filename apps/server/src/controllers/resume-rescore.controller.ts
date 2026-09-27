import { Request, Response } from "express";
import { Resume } from "../models/Resume.model.js";
import { Job } from "../models/Job.model.js";
import {
  scoreATS,
  ATS_ENGINE_VERSION,
} from "../services/ats-scoring.service.js";
import { scoreCache, scoreKey } from "../services/score-cache.js";

/**
 * POST /api/v1/resumes/:id/rescore
 *
 * Re-runs the current scoring engine against the resume's stored content and
 * its job's parsedJD, and returns stored vs fresh with deltas. NEVER writes
 * to the resume — stored scores are immutable per version (design doc §11).
 * Bypasses the cache read (the point is a fresh comparison) but writes the
 * fresh result through so a following quick-check can reuse it.
 */
export async function rescoreResume(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const resume = await Resume.findOne({ _id: req.params.id, userId });
    if (!resume) {
      res.status(404).json({
        success: false,
        error: {
          code: "RESUME_NOT_FOUND",
          message: "Resume not found or access denied.",
        },
      });
      return;
    }

    if (!resume.jobId) {
      res.status(404).json({
        success: false,
        error: {
          code: "JOB_NOT_FOUND",
          message: "Resume is not linked to a job.",
        },
      });
      return;
    }
    const job = await Job.findOne({ _id: resume.jobId, userId });
    if (!job) {
      res.status(404).json({
        success: false,
        error: {
          code: "JOB_NOT_FOUND",
          message: "Linked job not found or access denied.",
        },
      });
      return;
    }
    if (!job.parsedJD) {
      res.status(400).json({
        success: false,
        error: {
          code: "JD_NOT_PARSED",
          message: "Job description must be parsed first.",
        },
      });
      return;
    }

    const resumeContent = {
      summary: resume.tailoredSummary || "",
      skills: resume.skills as never,
      experience: resume.experience as never,
      projects: resume.projects as never,
    };
    const fresh = await scoreATS(resumeContent, job.parsedJD);
    scoreCache.set(
      scoreKey(resumeContent, job.parsedJD, ATS_ENGINE_VERSION),
      fresh,
    );

    const stored = resume.atsScore;
    res.json({
      success: true,
      data: {
        resumeId: String(resume._id),
        stored: {
          overallScore: stored?.overallScore ?? null,
          keywordMatchScore: stored?.keywordMatchScore ?? null,
          engineVersion: stored?.engineVersion ?? null,
        },
        fresh: {
          overallScore: fresh.overallScore,
          keywordMatchScore: fresh.keywordMatchScore,
          engineVersion: fresh.engineVersion,
        },
        delta: {
          overallScore: fresh.overallScore - (stored?.overallScore ?? 0),
          keywordMatchScore:
            fresh.keywordMatchScore - (stored?.keywordMatchScore ?? 0),
        },
        overwritten: false,
      },
    });
  } catch (error) {
    console.error("Rescore error:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to rescore resume.",
      },
    });
  }
}
