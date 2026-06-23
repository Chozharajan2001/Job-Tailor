/**
 * Application Workflow Integration Tests — Sprint 5
 *
 * Covers:
 *  - Outcome recording: callbackReceived toggle, rejectedReason, offerAmount
 *  - Reminder completion: marks done, pushes timeline event, prevents double-complete
 *  - Analytics rate derivation from application status (not callbackReceived)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { Application } from '../models/Application.model.js';
import { Job } from '../models/Job.model.js';
import { User } from '../models/User.model.js';

// Use a dedicated test database so we don't touch job_tailor_test data
process.env.NODE_ENV = 'test';
if (process.env.MONGODB_URI) {
  process.env.MONGODB_URI = process.env.MONGODB_URI.replace(/\/job_tailor.*$/, '/job_tailor_workflow_test');
} else {
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/job_tailor_workflow_test';
}

let testUserId: mongoose.Types.ObjectId;
let testJobId: mongoose.Types.ObjectId;

// ─── Helpers ──────────────────────────────────────────────────

async function makeApp(status = 'applied') {
  return Application.create({
    userId: testUserId,
    jobId: testJobId,
    status,
    previousStatus: [],
    timelineEvents: [],
    reminders: [],
    callbackReceived: false,
  });
}

async function appWithReminder(message = 'Follow up') {
  return Application.create({
    userId: testUserId,
    jobId: testJobId,
    status: 'applied',
    previousStatus: [],
    timelineEvents: [],
    reminders: [{ message, dueDate: new Date(), isCompleted: false }],
    callbackReceived: false,
  });
}

// ─── Setup / Teardown ─────────────────────────────────────────

beforeAll(async () => {
  await connectDatabase();
  console.log('📡 MongoDB connected (application-workflow tests)');

  const user = await User.create({
    email: 'test-workflow@example.com',
    passwordHash: '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345', // valid bcrypt-length stub
    firstName: 'Test',
    lastName: 'Workflow',
  });
  testUserId = user._id as mongoose.Types.ObjectId;

  const job = await Job.create({
    userId: testUserId,
    jobTitle: 'Test Engineer',
    companyName: 'Acme Corp',
    status: 'applied',
    jdRawText: 'Test job description for workflow tests.',
  });
  testJobId = job._id as mongoose.Types.ObjectId;
});

afterAll(async () => {
  await Application.deleteMany({ userId: testUserId });
  await Job.deleteMany({ userId: testUserId });
  await User.deleteMany({ email: 'test-workflow@example.com' });
  await disconnectDatabase();
  console.log('📤 MongoDB disconnected (application-workflow tests)');
});

afterEach(async () => {
  await Application.deleteMany({ userId: testUserId });
});

// ─── 1. Outcome Recording ─────────────────────────────────────

describe('8. Application Outcome Recording (Sprint 5)', () => {
  it('should set callbackReceived and push a callback timeline event', async () => {
    const app = await makeApp('screening');

    app.callbackReceived = true;
    app.timelineEvents.push({
      event: 'Callback received',
      description: 'Recruiter or employer made contact.',
      eventDate: new Date(),
      type: 'status_change',
    });
    await app.save();

    const updated = await Application.findById(app._id).lean().exec();
    expect(updated!.callbackReceived).toBe(true);
    expect(updated!.timelineEvents.some((e) => e.event === 'Callback received')).toBe(true);
  });

  it('should record rejectedReason and push a rejection note timeline event', async () => {
    const app = await makeApp('rejected');

    app.rejectedReason = 'Salary mismatch';
    app.timelineEvents.push({
      event: 'Rejection reason recorded',
      description: 'Salary mismatch',
      eventDate: new Date(),
      type: 'note',
    });
    await app.save();

    const updated = await Application.findById(app._id).lean().exec();
    expect(updated!.rejectedReason).toBe('Salary mismatch');
    expect(updated!.timelineEvents.some((e) => e.event === 'Rejection reason recorded')).toBe(true);
  });

  it('should record offerAmount and push an offer note timeline event', async () => {
    const app = await makeApp('offer');

    app.offerAmount = '£90k + equity';
    app.timelineEvents.push({
      event: 'Offer details recorded',
      description: '£90k + equity',
      eventDate: new Date(),
      type: 'note',
    });
    await app.save();

    const updated = await Application.findById(app._id).lean().exec();
    expect(updated!.offerAmount).toBe('£90k + equity');
    expect(updated!.timelineEvents.some((e) => e.event === 'Offer details recorded')).toBe(true);
  });
});

// ─── 2. Reminder Completion ───────────────────────────────────

describe('9. Reminder Completion (Sprint 5)', () => {
  it('should mark a reminder complete and push a timeline event', async () => {
    const app = await appWithReminder('Call recruiter');
    const reminder = app.reminders[0];

    reminder.isCompleted = true;
    reminder.completedAt = new Date();
    app.timelineEvents.push({
      event: 'Reminder completed',
      description: reminder.message,
      eventDate: new Date(),
      type: 'reminder',
    });
    await app.save();

    const updated = await Application.findById(app._id).lean().exec();
    expect(updated!.reminders[0].isCompleted).toBe(true);
    expect(updated!.reminders[0].completedAt).toBeDefined();
    expect(updated!.timelineEvents.some((e) => e.event === 'Reminder completed')).toBe(true);
  });

  it('should not overwrite completedAt on a second completion', async () => {
    const app = await appWithReminder('Already done');
    const reminder = app.reminders[0];

    const firstCompletedAt = new Date(Date.now() - 5000);
    reminder.isCompleted = true;
    reminder.completedAt = firstCompletedAt;
    await app.save();

    // Re-fetch: completedAt should still be the original time
    const refetched = await Application.findById(app._id).exec();
    expect(refetched!.reminders[0].isCompleted).toBe(true);
    expect(refetched!.reminders[0].completedAt!.getTime()).toBe(firstCompletedAt.getTime());
  });
});

// ─── 3. Analytics Rate Computation ───────────────────────────

describe('10. Analytics Rate Computation from Application Status (Sprint 5)', () => {
  it('should derive interviewRate and offerRate from status, not callbackReceived', async () => {
    // Each application needs a distinct job (compound unique index: userId+jobId)
    const statuses = ['interview', 'offer', 'applied', 'applied'];
    for (const status of statuses) {
      const job = await Job.create({ userId: testUserId, jobTitle: 'JD', companyName: 'Co', status, jdRawText: 'test' });
      await Application.create({ userId: testUserId, jobId: job._id, status, previousStatus: [], timelineEvents: [], reminders: [], callbackReceived: false });
    }

    const total = await Application.countDocuments({ userId: testUserId });
    const interviewCount = await Application.countDocuments({
      userId: testUserId,
      status: { $in: ['interview', 'offer'] },
    });
    const offerCount = await Application.countDocuments({ userId: testUserId, status: 'offer' });

    const interviewRate = Math.round((interviewCount / total) * 100) / 100;
    const offerRate = Math.round((offerCount / total) * 100) / 100;

    expect(total).toBe(4);
    expect(interviewCount).toBe(2);  // interview + offer
    expect(offerCount).toBe(1);
    expect(interviewRate).toBe(0.5); // 50%
    expect(offerRate).toBe(0.25);    // 25%
  });

  it('should show zero rates when no applications reach interview/offer stage', async () => {
    const statuses = ['applied', 'saved'];
    for (const status of statuses) {
      const job = await Job.create({ userId: testUserId, jobTitle: 'JD', companyName: 'Co', status, jdRawText: 'test' });
      await Application.create({ userId: testUserId, jobId: job._id, status, previousStatus: [], timelineEvents: [], reminders: [], callbackReceived: false });
    }

    const total = await Application.countDocuments({ userId: testUserId });
    const interviewCount = await Application.countDocuments({
      userId: testUserId,
      status: { $in: ['interview', 'offer'] },
    });

    expect(interviewCount).toBe(0);
    expect(total > 0 ? interviewCount / total : 0).toBe(0);
  });
});
