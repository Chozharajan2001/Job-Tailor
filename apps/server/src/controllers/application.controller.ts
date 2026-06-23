import { Request, Response } from 'express';
import { Application, IApplication } from '../models/Application.model.js';
import { Job } from '../models/Job.model.js';
import { Resume } from '../models/Resume.model.js';

/**
 * POST /api/v1/applications — Create a new job application (link job + resume).
 */
export async function createApplication(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { jobId, resumeId, status = 'applied', appliedDate = new Date() } = req.body;

  // Validate required fields
  if (!jobId) {
    res.status(400).json({
      success: false,
      error: { code: 'MISSING_JOB_ID', message: 'jobId is required to create an application.' },
    });
    return;
  }

  // Verify job exists and belongs to user
  const job = await Job.findOne({ _id: jobId, userId }).lean().exec();
  if (!job) {
    res.status(404).json({
      success: false,
      error: { code: 'JOB_NOT_FOUND', message: 'Job not found or does not belong to you.' },
    });
    return;
  }

  // If resumeId provided, verify it exists
  if (resumeId) {
    const resume = await Resume.findOne({ _id: resumeId, userId }).lean().exec();
    if (!resume) {
      res.status(404).json({
        success: false,
        error: { code: 'RESUME_NOT_FOUND', message: 'Resume not found or does not belong to you.' },
      });
      return;
    }
  }

  // Check if application already exists for this job
  const existingApplication = await Application.findOne({ userId, jobId }).lean().exec();
  if (existingApplication) {
    res.status(409).json({
      success: false,
      error: {
        code: 'APPLICATION_EXISTS',
        message: 'An application for this job already exists.',
        data: { applicationId: existingApplication._id },
      },
    });
    return;
  }

  // Create application with initial timeline event
  const application = await Application.create({
    userId,
    jobId,
    resumeId: resumeId || null,
    status,
    previousStatus: [],
    timelineEvents: [
      {
        event: 'Application created',
        description: `Application submitted for ${job.jobTitle} at ${job.companyName}`,
        eventDate: new Date(appliedDate),
        type: 'status_change',
      },
    ],
    reminders: [],
    callbackReceived: false,
  });

  // Update job status to match application
  await Job.findByIdAndUpdate(jobId, { status, appliedDate });

  // Populate response
  const populatedApplication = await Application.findById(application._id)
    .populate('jobId', 'companyName jobTitle location workType')
    .populate('resumeId', 'versionLabel atsScore pdfUrl')
    .lean()
    .exec();

  res.status(201).json({ success: true, data: { application: populatedApplication } });
}

/**
 * GET /api/v1/applications — List all applications (for Kanban board data).
 */
export async function listApplications(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const status = req.query.status as string;

  const query: Record<string, unknown> = { userId };
  if (status) query.status = status;

  // Populate job and resume references for rich card display
  const applications = await Application.find(query)
    .populate('jobId', 'companyName jobTitle location workType')
    .populate('resumeId', 'versionLabel atsScore')
    .sort({ updatedAt: -1 })
    .lean<IApplication[]>()
    .exec();

  res.json({ success: true, data: { applications } });
}

/**
 * GET /api/v1/applications/:id — Get application detail with full timeline.
 */
export async function getApplication(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;

  const application = await Application.findOne({ _id: req.params.id, userId })
    .populate('jobId')
    .populate('resumeId')
    .lean<IApplication>()
    .exec();

  if (!application) {
    res.status(404).json({
      success: false,
      error: { code: 'APPLICATION_NOT_FOUND', message: 'Application not found.' },
    });
    return;
  }

  res.json({ success: true, data: { application } });
}

/**
 * PATCH /api/v1/applications/:id/status — Move through pipeline stages.
 */
export async function updateStatus(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { status, note } = req.body;

  if (!status) {
    res.status(400).json({
      success: false,
      error: { code: 'MISSING_STATUS', message: 'Status is required.' },
    });
    return;
  }

  const validStatuses = ['saved', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'];
  if (!validStatuses.includes(status)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_STATUS', message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
    });
    return;
  }

  // Add timeline event
  const timelineEvent = {
    event: `Status changed to ${status}`,
    description: note || `Application moved to ${status}`,
    eventDate: new Date(),
    type: 'status_change',
  };

  const existingApplication = await Application.findOne({ _id: req.params.id, userId }).select('status').exec();

  if (!existingApplication) {
    res.status(404).json({
      success: false,
      error: { code: 'APPLICATION_NOT_FOUND', message: 'Application not found.' },
    });
    return;
  }

  const application = await Application.findOneAndUpdate(
    { _id: req.params.id, userId },
    {
      status,
      $push: {
        timelineEvents: timelineEvent,
        previousStatus: existingApplication.status,
      },
    },
    { new: true }
  ).lean().exec();

  if (!application) {
    res.status(404).json({
      success: false,
      error: { code: 'APPLICATION_NOT_FOUND', message: 'Application not found.' },
    });
    return;
  }

  res.json({ success: true, data: { application } });
}

/**
 * POST /api/v1/applications/:id/notes — Add a note.
 */
export async function addNote(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { content } = req.body;

  if (!content?.trim()) {
    res.status(400).json({
      success: false,
      error: { code: 'MISSING_CONTENT', message: 'Note content is required.' },
    });
    return;
  }

  const application = await Application.findOneAndUpdate(
    { _id: req.params.id, userId },
    {
      $push: {
        timelineEvents: {
          event: 'Note added',
          description: content.trim(),
          eventDate: new Date(),
          type: 'note',
        },
      },
    },
    { new: true }
  ).lean().exec();

  if (!application) {
    res.status(404).json({
      success: false,
      error: { code: 'APPLICATION_NOT_FOUND', message: 'Application not found.' },
    });
    return;
  }

  res.json({ success: true, data: { application } });
}

/**
 * POST /api/v1/applications/:id/reminders — Set a follow-up reminder.
 */
export async function addReminder(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { message, dueDate } = req.body;

  if (!message?.trim() || !dueDate) {
    res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'Message and dueDate are required for reminders.' },
    });
    return;
  }

  const application = await Application.findOneAndUpdate(
    { _id: req.params.id, userId },
    {
      $push: {
        reminders: {
          message: message.trim(),
          dueDate: new Date(dueDate),
          isCompleted: false,
        },
        timelineEvents: {
          event: 'Reminder set',
          description: `${message.trim()} — Due: ${new Date(dueDate).toLocaleDateString()}`,
          eventDate: new Date(),
          type: 'reminder' as const,
        },
      },
    },
    { new: true }
  ).lean().exec();

  if (!application) {
    res.status(404).json({
      success: false,
      error: { code: 'APPLICATION_NOT_FOUND', message: 'Application not found.' },
    });
    return;
  }

  res.status(201).json({ success: true, data: { reminder: application.reminders[application.reminders.length - 1] } });
}

/**
 * DELETE /api/v1/applications/:id — Delete a job application.
 */
export async function deleteApplication(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { id } = req.params;

  const result = await Application.deleteOne({ _id: id, userId }).exec();
  if (result.deletedCount === 0) {
    res.status(404).json({
      success: false,
      error: { code: 'APPLICATION_NOT_FOUND', message: 'Application not found or does not belong to you.' },
    });
    return;
  }

  res.json({ success: true, data: { message: 'Application deleted successfully.' } });
}

/**
 * PATCH /api/v1/applications/:id/outcome — Record outcome fields.
 * Accepts any combination of: callbackReceived (bool), rejectedReason (string), offerAmount (string).
 */
export async function recordOutcome(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { callbackReceived, rejectedReason, offerAmount } = req.body;

  const existing = await Application.findOne({ _id: req.params.id, userId })
    .select('callbackReceived')
    .exec();

  if (!existing) {
    res.status(404).json({
      success: false,
      error: { code: 'APPLICATION_NOT_FOUND', message: 'Application not found.' },
    });
    return;
  }

  const updateFields: Record<string, unknown> = {};
  const newEvents: Array<{ event: string; description: string; eventDate: Date; type: string }> = [];

  if (typeof callbackReceived === 'boolean') {
    updateFields.callbackReceived = callbackReceived;
    if (callbackReceived && !existing.callbackReceived) {
      newEvents.push({
        event: 'Callback received',
        description: 'Recruiter or employer made contact.',
        eventDate: new Date(),
        type: 'status_change',
      });
    }
  }

  if (typeof rejectedReason === 'string' && rejectedReason.trim()) {
    updateFields.rejectedReason = rejectedReason.trim();
    newEvents.push({
      event: 'Rejection reason recorded',
      description: rejectedReason.trim(),
      eventDate: new Date(),
      type: 'note',
    });
  }

  if (typeof offerAmount === 'string' && offerAmount.trim()) {
    updateFields.offerAmount = offerAmount.trim();
    newEvents.push({
      event: 'Offer details recorded',
      description: offerAmount.trim(),
      eventDate: new Date(),
      type: 'note',
    });
  }

  if (Object.keys(updateFields).length === 0) {
    res.status(400).json({
      success: false,
      error: { code: 'NO_UPDATE_FIELDS', message: 'Provide at least one of: callbackReceived, rejectedReason, offerAmount.' },
    });
    return;
  }

  const application = await Application.findOneAndUpdate(
    { _id: req.params.id, userId },
    {
      $set: updateFields,
      ...(newEvents.length > 0 ? { $push: { timelineEvents: { $each: newEvents } } } : {}),
    },
    { new: true }
  ).lean().exec();

  res.json({ success: true, data: { application } });
}

/**
 * PATCH /api/v1/applications/:id/reminders/:rid/complete — Mark a reminder done.
 * Keeps the reminder visible in the list (strikethrough in UI) rather than deleting it.
 */
export async function completeReminder(req: Request, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { id, rid } = req.params;

  const application = await Application.findOne({ _id: id, userId }).exec();

  if (!application) {
    res.status(404).json({
      success: false,
      error: { code: 'APPLICATION_NOT_FOUND', message: 'Application not found.' },
    });
    return;
  }

  const reminder = application.reminders.find((r) => r._id.toString() === rid);
  if (!reminder) {
    res.status(404).json({
      success: false,
      error: { code: 'REMINDER_NOT_FOUND', message: 'Reminder not found.' },
    });
    return;
  }

  if (reminder.isCompleted) {
    res.status(409).json({
      success: false,
      error: { code: 'ALREADY_COMPLETED', message: 'Reminder is already marked complete.' },
    });
    return;
  }

  reminder.isCompleted = true;
  reminder.completedAt = new Date();

  application.timelineEvents.push({
    event: 'Reminder completed',
    description: reminder.message,
    eventDate: new Date(),
    type: 'reminder',
  });

  await application.save();

  res.json({ success: true, data: { application: application.toObject() } });
}
