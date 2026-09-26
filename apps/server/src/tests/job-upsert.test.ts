import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../models/User.model.js";
import { Job } from "../models/Job.model.js";
import { findOrCreateJob } from "../services/job-upsert.service.js";
import type { ApplicationDraft } from "../services/application-draft.types.js";
import { connectTestDb, disconnectTestDb } from "./helpers/test-db.js";

process.env.NODE_ENV = "test";

const validHash = bcrypt.hashSync("x", 10);

function draft(overrides: Partial<ApplicationDraft> = {}): ApplicationDraft {
  return {
    platform: "greenhouse",
    sourceUrl: "https://boards.greenhouse.io/acme/jobs/101",
    companyName: "Acme",
    jobTitle: "Senior Engineer",
    jdRawText: "Do engineering.",
    detectedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("findOrCreateJob", () => {
  let userId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    await connectTestDb();
  });
  afterAll(async () => {
    await disconnectTestDb();
  });
  beforeEach(async () => {
    await Job.deleteMany({});
    await User.deleteMany({});
    const u = await User.create({
      email: `owner-${Date.now()}@x.co`,
      passwordHash: validHash,
      firstName: "O",
      lastName: "T",
      emailVerified: true,
    });
    userId = u._id as mongoose.Types.ObjectId;
  });

  it("creates a fresh Job when neither URL nor title exists", async () => {
    const { job, created } = await findOrCreateJob(String(userId), draft());
    expect(created).toBe(true);
    expect(job.jobLink).toBe("https://boards.greenhouse.io/acme/jobs/101");
    expect(job.companyName).toBe("Acme");
    expect(job.jobTitle).toBe("Senior Engineer");
  });

  it("reuses an existing Job when jobLink matches exactly", async () => {
    const first = await findOrCreateJob(String(userId), draft());
    const second = await findOrCreateJob(String(userId), draft());
    expect(second.created).toBe(false);
    expect(String(second.job._id)).toBe(String(first.job._id));
  });

  it("reuses by company+title (case-insensitive) when URL differs", async () => {
    const orig = draft({
      sourceUrl: "https://boards.greenhouse.io/acme/jobs/101",
      companyName: "Acme",
      jobTitle: "Senior Engineer",
    });
    await findOrCreateJob(String(userId), orig);

    const variant = draft({
      sourceUrl: "https://boards.greenhouse.io/acme/jobs/999?utm=ref",
      companyName: "acme",
      jobTitle: "SENIOR ENGINEER",
    });
    const r = await findOrCreateJob(String(userId), variant);
    expect(r.created).toBe(false);
  });

  it("ignores a same-title match older than 60 days", async () => {
    // Insert a stale job by hand with createdAt 90 days ago.
    const stale = await Job.create({
      userId,
      companyName: "Acme",
      jobTitle: "Senior Engineer",
      jdRawText: "old",
      jobLink: "https://gh/acme/stale",
    });
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    // Bypass timestamps plugin by touching the raw doc in the collection.
    await Job.collection.updateOne(
      { _id: stale._id },
      { $set: { createdAt: ninetyDaysAgo, updatedAt: ninetyDaysAgo } },
    );

    const fresh = draft({
      sourceUrl: "https://boards.greenhouse.io/acme/jobs/new",
      companyName: "Acme",
      jobTitle: "Senior Engineer",
    });
    const r = await findOrCreateJob(String(userId), fresh);
    expect(r.created).toBe(true);
  });

  it("idempotent: N identical drafts collapse to one Job row", async () => {
    const d = draft();
    for (let i = 0; i < 5; i++) await findOrCreateJob(String(userId), d);
    const count = await Job.countDocuments({ userId });
    expect(count).toBe(1);
  });
});
