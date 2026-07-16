import { Request, Response } from 'express';
import { Resume, IResume } from '../models/Resume.model.js';
import { Job, IJob } from '../models/Job.model.js';
import { Profile, IProfile } from '../models/Profile.model.js';
import { tailorResume } from '../services/resume-tailor.service.js';
import { scoreATS } from '../services/ats-scoring.service.js';
import { generatePDF } from '../services/pdf-generator.service.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = 'uploads/resumes';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `resume-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

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
      profile as unknown as IProfile,
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

/**
 * POST /api/v1/resumes/:id/pdf — Generate and download PDF for a resume.
 */
export async function downloadPDF(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;

  const resume = await Resume.findOne({ _id: req.params.id, userId }).exec();

  if (!resume) {
    res.status(404).json({ success: false, error: { code: 'RESUME_NOT_FOUND', message: 'Resume not found.' } });
    return;
  }

  try {
    const { pdfUrl } = await generatePDF(resume);

    // Update resume with PDF URL if it's a Cloudinary URL (not base64)
    if (!pdfUrl.startsWith('data:')) {
      resume.pdfUrl = pdfUrl;
      await resume.save();
    }

    res.json({ success: true, data: { pdfUrl, resumeId: resume._id } });
  } catch (error) {
    console.error('PDF generation failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate PDF';
    res.status(500).json({
      success: false,
      error: { code: 'PDF_GENERATION_FAILED', message },
    });
  }
}

/**
 * POST /api/v1/resumes/upload — Upload existing resume PDF.
 */
export async function uploadResumePDF(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;

  if (!req.file) {
    res.status(400).json({
      success: false,
      error: { code: 'NO_FILE_UPLOADED', message: 'No PDF file uploaded.' },
    });
    return;
  }

  const pdfUrl = `/uploads/resumes/${req.file.filename}`;

  try {
    const existingResumes = await Resume.countDocuments({ userId });
    const nextVersion = existingResumes + 1;
    
    // Clean original name for versionLabel
    const originalNameClean = req.file.originalname
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-zA-Z0-9_\-\s]/g, "");
    const versionLabel = `${originalNameClean}_v${nextVersion}`;

    const resume = await Resume.create({
      userId,
      version: nextVersion,
      versionLabel,
      pdfUrl,
      status: 'draft',
      skills: [],
      experience: [],
      projects: [],
      sectionOrder: ['skills', 'experience', 'projects', 'education'],
      atsScore: {
        overallScore: 0,
        keywordMatchScore: 0,
        semanticMatchScore: 0,
        sectionCompletenessScore: 0,
        formatScore: 0,
        breakdown: {
          matchedSkills: [],
          missingSkills: [],
          weakSkills: [],
          actionItems: [],
        },
      },
    });

    res.status(201).json({
      success: true,
      data: {
        resume,
        pdfUrl,
        filename: req.file.filename,
        message: 'Resume PDF uploaded and registered successfully',
      },
    });
  } catch (error) {
    console.error('Failed to create resume entry on upload:', error);
    res.status(500).json({
      success: false,
      error: { code: 'UPLOAD_REGISTRATION_FAILED', message: 'Failed to record resume upload.' },
    });
  }
}

/**
 * GET /api/v1/resumes/:id/reuse — Get latest resume for reuse in new application.
 */
export async function getReusableResume(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { jobId } = req.query;

  // If jobId provided, get latest resume for that job
  if (jobId) {
    const resume = await Resume.findOne({ userId, jobId })
      .sort({ version: -1 })
      .lean<IResume>()
      .exec();

    if (!resume) {
      res.status(404).json({
        success: false,
        error: { code: 'NO_RESUME_FOUND', message: 'No existing resume found for this job.' },
      });
      return;
    }

    res.json({ success: true, data: { resume, canReuse: true } });
    return;
  }

  // Otherwise, get most recent resume across all jobs
  const resume = await Resume.findOne({ userId })
    .sort({ createdAt: -1 })
    .lean<IResume>()
    .exec();

  if (!resume) {
    res.status(404).json({
      success: false,
      error: { code: 'NO_RESUME_FOUND', message: 'No existing resumes found.' },
    });
    return;
  }

  res.json({ success: true, data: { resume, canReuse: true } });
}

/**
 * POST /api/v1/resumes/quick-ats-check — Quick ATS score check for a job without generating full resume.
 * Uses job-specific attached resume if available, otherwise uses profile-based resume.
 */
export async function quickATSCheck(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { jobId } = req.body;

  // Validate inputs
  if (!jobId) {
    res.status(400).json({
      success: false,
      error: { code: 'MISSING_JOB_ID', message: 'jobId is required.' },
    });
    return;
  }

  try {
    // Get the job with parsed JD
    const job = await Job.findOne({ _id: jobId, userId }).lean<IJob>().exec();
    
    if (!job) {
      res.status(404).json({
        success: false,
        error: { code: 'JOB_NOT_FOUND', message: 'Job not found or access denied.' },
      });
      return;
    }

    if (!job.parsedJD) {
      res.status(400).json({
        success: false,
        error: { code: 'JD_NOT_PARSED', message: 'Job description must be parsed first.' },
      });
      return;
    }

    // Determine which resume to use for ATS check
    let resumeToUse: IResume | null = null;
    let resumeSource: 'attached' | 'profile' | 'none' = 'none';

    // Priority 1: Check if job has an attached resume
    if (job.attachedResumeId) {
      const attachedResume = await Resume.findOne({ 
        _id: job.attachedResumeId, 
        userId 
      }).lean<IResume>().exec();
      
      if (attachedResume) {
        resumeToUse = attachedResume;
        resumeSource = 'attached';
      }
    }

    // Priority 2: If no attached resume, use profile-based resume
    if (!resumeToUse) {
      const profileResume = await Resume.findOne({ 
        userId, 
        isProfileResume: true 
      })
        .sort({ createdAt: -1 })
        .lean<IResume>()
        .exec();
      
      if (profileResume) {
        resumeToUse = profileResume;
        resumeSource = 'profile';
      }
    }

    // If no resume found at all
    if (!resumeToUse) {
      res.status(404).json({
        success: false,
        error: { 
          code: 'NO_RESUME_AVAILABLE', 
          message: 'No resume available for ATS check. Please upload a resume to your profile or attach one to this job.',
          suggestion: 'Go to Profile page to set up your master resume, or upload a resume when creating/editing this job.'
        },
      });
      return;
    }

    // Calculate ATS score using existing service
    const atsScore = await scoreATS({
      summary: resumeToUse.tailoredSummary || '',
      skills: resumeToUse.skills as any,
      experience: resumeToUse.experience as any,
      projects: resumeToUse.projects as any,
    }, job.parsedJD);

    res.json({
      success: true,
      data: {
        atsScore,
        resumeSource, // Indicates whether we used 'attached' or 'profile' resume
        resumeId: resumeToUse._id,
        resumeVersionLabel: resumeToUse.versionLabel,
        pdfUrl: resumeToUse.pdfUrl,
        message: resumeSource === 'attached' 
          ? 'ATS score calculated using job-specific attached resume'
          : 'ATS score calculated using your profile-based master resume',
      },
    });
  } catch (error) {
    console.error('Quick ATS check error:', error);
    res.status(500).json({
      success: false,
      error: { 
        code: 'INTERNAL_ERROR', 
        message: 'Failed to perform ATS check. Please try again.' 
      },
    });
  }
}
