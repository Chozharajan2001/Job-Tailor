import { Request, Response } from 'express';
import { Resume, IResume } from '../models/Resume.model.js';
import { Job, IJob } from '../models/Job.model.js';
import { Profile, IProfile } from '../models/Profile.model.js';
import { tailorResume } from '../services/resume-tailor.service.js';

/**
 * POST /api/v1/resumes/generate — Generate tailored resume for a job.
 */
export async function generateResume(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { jobId, options = {} } = req.body;

  // Validate inputs
  if (!jobId) {
    res.status(400).json({
      success: false,
      error: { code: 'MISSING_JOB_ID', message: 'jobId is required to generate a resume.' },
    });
    return;
  }

  // Fetch job
  const job = await Job.findOne({ _id: jobId, userId }).lean<IJob>().exec();
  if (!job) {
    res.status(404).json({ success: false, error: { code: 'JOB_NOT_FOUND', message: 'Job not found.' } });
    return;
  }

  if (!job.parsedJD) {
    res.status(400).json({
      success: false,
      error: { code: 'JD_NOT_PARSED', message: 'Job JD has not been parsed yet. Call POST /jobs/:id/parse first.' },
    });
    return;
  }

  // Fetch master profile
  const profile = await Profile.findOne({ userId }).lean().exec();
  if (!profile) {
    res.status(404).json({
      success: false,
      error: { code: 'PROFILE_NOT_FOUND', message: 'Master profile not found. Create your profile first.' },
    });
    return;
  }

  // Get next version number for this job
  const existingResumes = await Resume.countDocuments({ userId, jobId });
  const nextVersion = existingResumes + 1;

  try {
    // Run the tailor engine!
    const tailored = await tailorResume(
      profile as IProfile,
      job.parsedJD,
      options
    );

    const versionLabel = `${job.companyName}_${job.jobTitle.replace(/\s+/g, '_')}_v${nextVersion}`;

    // Save generated resume
    const resume = await Resume.create({
      userId,
      jobId: job._id,
      version: nextVersion,
      versionLabel,
      tailoredSummary: tailored.tailoredSummary,
      skills: tailored.skills,
      experience: tailored.experience,
      projects: tailored.projects || [],
      sectionOrder: tailored.sectionOrder,
      atsScore: tailored.atsScore,
      status: 'generated',
    });

    res.status(201).json({ success: true, data: { resume } });
  } catch (error) {
    console.error('Resume generation failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate resume';
    res.status(500).json({
      success: false,
      error: { code: 'RESUME_GENERATION_FAILED', message },
    });
  }
}

/**
 * GET /api/v1/resumes — List resumes (filterable by jobId).
 */
export async function listResumes(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { jobId } = req.query;

  const query: Record<string, unknown> = { userId };
  if (jobId) query.jobId = jobId;

  const resumes = await Resume.find(query)
    .sort({ createdAt: -1 })
    .lean<IResume[]>()
    .exec();

  res.json({ success: true, data: { resumes } });
}

/**
 * GET /api/v1/resumes/:id — Get single resume with full detail.
 */
export async function getResume(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const resume = await Resume.findOne({ _id: req.params.id, userId }).lean<IResume>().exec();

  if (!resume) {
    res.status(404).json({ success: false, error: { code: 'RESUME_NOT_FOUND', message: 'Resume not found.' } });
    return;
  }

  res.json({ success: true, data: { resume } });
}

/**
 * PUT /api/v1/resumes/:id — Manually edit generated resume content.
 */
export async function updateResume(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;

  const resume = await Resume.findOneAndUpdate(
    { _id: req.params.id, userId },
    req.body,
    { new: true }
  ).lean<IResume>().exec();

  if (!resume) {
    res.status(404).json({ success: false, error: { code: 'RESUME_NOT_FOUND', message: 'Resume not found.' } });
    return;
  }

  res.json({ success: true, data: { resume } });
}
