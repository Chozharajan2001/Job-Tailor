import { Request, Response } from 'express';
import { Application, IApplication } from '../models/Application.model.js';
import { Resume, IResume } from '../models/Resume.model.js';
import { Job, IJob } from '../models/Job.model.js';
import { AnalyticsService } from '../services/analytics.service.js';
import { SourceRegistry } from '../models/SourceRegistry.model.js';

/**
 * GET /api/v1/analytics/overview
 * Dashboard stats: totals, rates, pipeline funnel, top skills.
 */
export async function getOverview(_req: Request, res: Response): Promise<void> {
  const userId = _req.user!.userId;

  // Run independent aggregations in parallel
  const [
    totalApplications,
    thisWeekApplied,
    interviewCount,
    offerCount,
    allApplications,
    recentResumes,
  ] = await Promise.all([
    Application.countDocuments({ userId }),
    Application.countDocuments({
      userId,
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      status: 'applied',
    }),
    // Count applications that reached interview or offer stage
    Application.countDocuments({ userId, status: { $in: ['interview', 'offer'] } }),
    Application.countDocuments({ userId, status: 'offer' }),
    Application.find({ userId }).populate('resumeId').lean(),
    Resume.find({ userId }).sort({ createdAt: -1 }).limit(50).populate('jobId').lean(),
  ]);

  const total = totalApplications || 0;
  // interviewRate = applications that reached interview or offer / total
  const interviewRate = total > 0 ? Math.round((interviewCount / total) * 100) / 100 : 0;
  // offerRate = applications that reached offer / total
  const offerRate = total > 0 ? Math.round((offerCount / total) * 100) / 100 : 0;

  // Calculate average ATS score from recent resumes
  const avgATSScore =
    recentResumes.length > 0
      ? Math.round(
          recentResumes.reduce((sum, r) => sum + ((r as unknown as IResume).atsScore?.overallScore || 0), 0) /
            recentResumes.length
        )
      : 0;

  // Pipeline funnel
  const pipelineFunnel: Record<string, number> = {
    saved: await Application.countDocuments({ userId, status: 'saved' }),
    applied: await Application.countDocuments({ userId, status: 'applied' }),
    screening: await Application.countDocuments({ userId, status: 'screening' }),
    interview: await Application.countDocuments({ userId, status: 'interview' }),
    offer: await Application.countDocuments({ userId, status: 'offer' }),
    rejected: await Application.countDocuments({ userId, status: 'rejected' }),
  };

  // Extract top matching skills from ATS breakdowns of recent resumes
  const skillFrequency: Record<string, number> = {};
  recentResumes.forEach((r) => {
    const resume = r as unknown as IResume;
    if (resume.atsScore?.breakdown?.matchedSkills) {
      resume.atsScore.breakdown.matchedSkills.forEach((ms) => {
        if (ms.presentInResume && ms.presentInJD) {
          skillFrequency[ms.skill] = (skillFrequency[ms.skill] || 0) + 1;
        }
      });
    }
  });
  const topMatchingSkills = Object.entries(skillFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([skill, count]) => ({ skill, count }));

  // Common missing skills across JDs
  const gapFrequency: Record<string, number> = {};
  recentResumes.forEach((r) => {
    const resume = r as unknown as IResume;
    if (resume.atsScore?.breakdown?.missingSkills) {
      resume.atsScore.breakdown.missingSkills.forEach((ms) => {
        gapFrequency[ms.skill] = (gapFrequency[ms.skill] || 0) + 1;
      });
    }
  });
  const commonGaps = Object.entries(gapFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([skill, count]) => ({ skill, count }));

  // Resume performance: count applications in interview/offer per resume version
  const resumePerfMap: Record<string, { usageCount: number; successCount: number }> = {};
  allApplications.forEach((app) => {
    const application = app as unknown as IApplication;
    const label = (application.resumeId as unknown as { versionLabel?: string })?.versionLabel || 'unknown';
    if (!resumePerfMap[label]) {
      resumePerfMap[label] = { usageCount: 0, successCount: 0 };
    }
    resumePerfMap[label].usageCount++;
    if (['interview', 'offer'].includes(application.status)) {
      resumePerfMap[label].successCount++;
    }
  });

  const resumePerformance = Object.entries(resumePerfMap).map(([versionLabel, data]) => ({
    versionLabel,
    usageCount: data.usageCount,
    callbackRate: data.usageCount > 0 ? Math.round((data.successCount / data.usageCount) * 100) / 100 : 0,
  }));

  res.json({
    success: true,
    data: {
      totalApplications: total,
      thisWeekApplied,
      interviewRate,
      offerRate,
      averageATSScore: avgATSScore,
      topMatchingSkills,
      commonGaps,
      pipelineFunnel,
      resumePerformance,
    },
  });
}

/**
 * GET /api/v1/analytics/resume-performance
 */
export async function getResumePerformance(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const resumes = await Resume.find({ userId })
    .populate('jobId', 'companyName jobTitle status')
    .lean()
    .exec();

  res.json({ success: true, data: { resumes } });
}

/**
 * GET /api/v1/analytics/status-breakdown
 * Pipeline funnel with counts per stage.
 */
export async function getStatusBreakdown(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;

  const stages = ['saved', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'] as const;

  const counts = await Promise.all(
    stages.map(async (stage) => ({
      stage,
      count: await Application.countDocuments({ userId, status: stage }),
    }))
  );

  res.json({ success: true, data: { stages: counts } });
}

/**
 * GET /api/v1/analytics/skill-gap-report
 * Aggregate skill gaps across all parsed jobs.
 */
export async function getSkillGapReport(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;

  // Get all user's jobs that have been parsed
  const jobsWithParsedJD = await Job.find({
    userId,
    parsedJD: { $ne: null },
  })
    .select('parsedJD companyName jobTitle')
    .lean<IJob[]>()
    .exec();

  // Get all generated resumes with ATS scores
  const resumesWithScores = await Resume.find({
    userId,
    'atsScore.overallScore': { $gt: 0 },
  })
    .select('atsScore versionLabel jobId')
    .lean<IResume[]>()
    .exec();

  // Aggregate required skills from all JDs
  const allRequiredSkills: Record<string, { count: number; companies: string[] }> = {};
  jobsWithParsedJD.forEach((job) => {
    if (!job.parsedJD) return;
    job.parsedJD.requiredSkills.forEach((skill) => {
      if (!allRequiredSkills[skill]) {
        allRequiredSkills[skill] = { count: 0, companies: [] };
      }
      allRequiredSkills[skill].count++;
      allRequiredSkills[skill].companies.push(job.companyName);
    });
  });

  // Find gaps from resume scores
  const aggregateMissing: Record<string, { frequency: number; suggestions: Set<string>; requiredBy: string[] }> = {};
  resumesWithScores.forEach((resume) => {
    if (!resume.atsScore?.breakdown?.missingSkills) return;
    resume.atsScore.breakdown.missingSkills.forEach((ms) => {
      if (!aggregateMissing[ms.skill]) {
        aggregateMissing[ms.skill] = { frequency: 0, suggestions: new Set(), requiredBy: [] };
      }
      aggregateMissing[ms.skill].frequency++;
      aggregateMissing[ms.skill].suggestions.add(ms.suggestion);
      if (ms.required && resume.jobId) {
        const job = jobsWithParsedJD.find((j) => j._id.toString() === resume.jobId!.toString());
        if (job) aggregateMissing[ms.skill].requiredBy.push(job.companyName);
      }
    });
  });

  const skillGapReport = Object.entries(aggregateMissing)
    .map(([skill, data]) => ({
      skill,
      frequency: data.frequency,
      suggestions: Array.from(data.suggestions),
      requiredBy: [...new Set(data.requiredBy)],
      jdDemandCount: allRequiredSkills[skill]?.count || 0,
    })
  )
  .sort((a, b) => b.frequency - a.frequency);

  res.json({
    success: true,
    data: {
      totalJobsAnalyzed: jobsWithParsedJD.length,
      totalResumesScored: resumesWithScores.length,
      skillGapReport,
      mostDemandedSkills: Object.entries(allRequiredSkills)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(([skill, data]) => ({ skill, demand: data.count, companies: data.companies })),
    },
  });
}

export async function trackSearchClick(req: Request, res: Response): Promise<any> {
  try {
    const { canonicalJobId } = req.body;
    const userId = (req as any).user.userId;

    if (!canonicalJobId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'canonicalJobId is required' },
      });
    }

    await AnalyticsService.logInteraction(userId, canonicalJobId, 'click');

    return res.status(200).json({
      success: true,
    });
  } catch (err: any) {
    console.error('❌ trackSearchClick error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: err.message },
    });
  }
}

export async function submitFeedback(req: Request, res: Response): Promise<any> {
  try {
    const { canonicalJobId, interactionType, feedbackComment } = req.body;
    const userId = (req as any).user.userId;

    if (!canonicalJobId || !interactionType) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'canonicalJobId and interactionType are required' },
      });
    }

    if (!['flag_expired', 'flag_spam'].includes(interactionType)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'interactionType must be flag_expired or flag_spam' },
      });
    }

    await AnalyticsService.logInteraction(userId, canonicalJobId, interactionType, feedbackComment);

    return res.status(200).json({
      success: true,
    });
  } catch (err: any) {
    console.error('❌ submitFeedback error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: err.message },
    });
  }
}

export async function getDashboardStats(req: Request, res: Response): Promise<any> {
  try {
    const metrics = await AnalyticsService.getAnalyticsDashboard();
    return res.status(200).json({
      success: true,
      data: metrics,
    });
  } catch (err: any) {
    console.error('❌ getDashboardStats error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: err.message },
    });
  }
}

export async function updateSourceTrustManual(req: Request, res: Response): Promise<any> {
  try {
    const { id } = req.params;
    const { trustScore } = req.body;

    if (trustScore === undefined || typeof trustScore !== 'number' || trustScore < 0 || trustScore > 1) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'trustScore must be a number between 0 and 1' },
      });
    }

    const source = await SourceRegistry.findById(id);
    if (!source) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Source not found' },
      });
    }

    source.trustScore = parseFloat(trustScore.toFixed(4));
    await source.save();

    return res.status(200).json({
      success: true,
      data: source,
    });
  } catch (err: any) {
    console.error('❌ updateSourceTrustManual error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: err.message },
    });
  }
}
