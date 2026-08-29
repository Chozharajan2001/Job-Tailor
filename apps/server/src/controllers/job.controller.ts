import { Request, Response } from "express";
import { Job, IJob } from "../models/Job.model.js";
import { Resume } from "../models/Resume.model.js";
import { parseJD } from "../services/jd-parser.service.js";
import { escapeRegex } from "../utils/skill-matcher.js";

/**
 * POST /api/v1/jobs — Create a new job entry with JD text.
 */
export async function createJob(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;

  const job = await Job.create({
    userId,
    companyName: req.body.companyName,
    jobTitle: req.body.jobTitle,
    jobLink: req.body.jobLink,
    location: req.body.location || "",
    workType: req.body.workType || "remote",
    employmentType: req.body.employmentType || "full-time",
    salaryRange: req.body.salaryRange,
    postedDate: req.body.postedDate,
    jdRawText: req.body.jdRawText,
    attachedResumeId: req.body.attachedResumeId || null, // Support job-specific resume attachment
    status: "saved",
  });

  res.status(201).json({ success: true, data: { job } });
}

/**
 * GET /api/v1/jobs — List jobs with filters and pagination.
 */
export async function listJobs(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const status = req.query.status as string;
  const search = (req.query.search as string)?.trim();

  // Build query
  const query: Record<string, unknown> = { userId };
  if (status) query.status = status;
  if (search) {
    // Escape user input — it must never be interpreted as raw regex
    const escaped = escapeRegex(search);
    query.$or = [
      { companyName: { $regex: escaped, $options: "i" } },
      { jobTitle: { $regex: escaped, $options: "i" } },
      { jdRawText: { $regex: escaped, $options: "i" } },
    ];
  }

  // Sorting
  let sortBy = "-savedAt";
  if (req.query.sortBy === "company") sortBy = "companyName";
  if (req.query.sortBy === "atsScore") sortBy = "-savedAt"; // ATS score is on resume, not job

  const [jobs, total] = await Promise.all([
    Job.find(query)
      .sort(sortBy)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<IJob[]>()
      .exec(),
    Job.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: {
      jobs,
      pagination: { total, page, pages: Math.ceil(total / limit), limit },
    },
  });
}

/**
 * GET /api/v1/jobs/:id — Get single job with parsed JD.
 */
export async function getJob(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const job = await Job.findOne({ _id: req.params.id, userId })
    .lean<IJob>()
    .exec();

  if (!job) {
    res
      .status(404)
      .json({
        success: false,
        error: { code: "JOB_NOT_FOUND", message: "Job not found." },
      });
    return;
  }

  res.json({ success: true, data: { job } });
}

/**
 * PUT /api/v1/jobs/:id — Update job info.
 */
export async function updateJob(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;

  // Only allow certain fields to be updated
  const allowedUpdates = [
    "companyName",
    "jobTitle",
    "jobLink",
    "location",
    "workType",
    "employmentType",
    "salaryRange",
    "jdRawText",
    "status",
  ];
  const updates: Record<string, unknown> = {};
  allowedUpdates.forEach((field) => {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  });

  const job = await Job.findOneAndUpdate(
    { _id: req.params.id, userId },
    updates,
    { new: true },
  )
    .lean<IJob>()
    .exec();

  if (!job) {
    res
      .status(404)
      .json({
        success: false,
        error: { code: "JOB_NOT_FOUND", message: "Job not found." },
      });
    return;
  }

  res.json({ success: true, data: { job } });
}

/**
 * DELETE /api/v1/jobs/:id — Delete a job entry.
 */
export async function deleteJob(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const result = await Job.deleteOne({ _id: req.params.id, userId });

  if (result.deletedCount === 0) {
    res
      .status(404)
      .json({
        success: false,
        error: { code: "JOB_NOT_FOUND", message: "Job not found." },
      });
    return;
  }

  res.json({ success: true, data: { message: "Job deleted successfully." } });
}

/**
 * PATCH /api/v1/jobs/:id/attach-resume — Attach a resume to an existing job.
 */
export async function attachResumeToJob(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = req.user!.userId;
  const jobId = req.params.id;
  const { resumeId } = req.body;

  if (!resumeId) {
    res.status(400).json({
      success: false,
      error: { code: "MISSING_RESUME_ID", message: "resumeId is required." },
    });
    return;
  }

  try {
    // Verify job exists and belongs to user
    const job = await Job.findOne({ _id: jobId, userId });

    if (!job) {
      res.status(404).json({
        success: false,
        error: {
          code: "JOB_NOT_FOUND",
          message: "Job not found or access denied.",
        },
      });
      return;
    }

    // Verify resume exists and belongs to user
    const resume = await Resume.findOne({ _id: resumeId, userId });

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

    // Attach resume to job
    job.attachedResumeId = resume._id as any;
    await job.save();

    res.json({
      success: true,
      data: {
        job,
        message: "Resume successfully attached to job.",
      },
    });
  } catch (error) {
    console.error("Attach resume error:", error);
    res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to attach resume to job.",
      },
    });
  }
}

/**
 * POST /api/v1/jobs/:id/parse — Trigger LLM parsing of JD text.
 */
export async function parseJobJD(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;

  const job = await Job.findOne({ _id: req.params.id, userId });
  if (!job) {
    res
      .status(404)
      .json({
        success: false,
        error: { code: "JOB_NOT_FOUND", message: "Job not found." },
      });
    return;
  }

  try {
    const parsedJD = await parseJD(job.jdRawText);

    job.parsedJD = parsedJD;
    await job.save();

    res.json({ success: true, data: { parsedJD } });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to parse JD";
    res.status(502).json({
      success: false,
      error: { code: "JD_PARSE_FAILED", message },
    });
  }
}
