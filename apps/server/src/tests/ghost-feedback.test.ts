import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { CanonicalJob } from "../models/CanonicalJob.model.js";
import { JobInteractionLog } from "../models/JobInteractionLog.model.js";
import { AnalyticsService } from "../services/analytics.service.js";
import { connectTestDb, disconnectTestDb } from "./helpers/test-db.js";

process.env.NODE_ENV = "test";

describe("still_hiring feedback", () => {
  const userId = new mongoose.Types.ObjectId().toString();

  beforeAll(async () => {
    await connectTestDb();
  });
  afterAll(async () => {
    await disconnectTestDb();
  });
  beforeEach(async () => {
    await CanonicalJob.deleteMany({});
    await JobInteractionLog.deleteMany({});
  });

  it("pins the verdict and clears the risk", async () => {
    const job = await CanonicalJob.create({
      sourceName: "Acme (Greenhouse)",
      companyName: "Acme",
      jobTitle: "Engineer",
      location: "Remote",
      workType: "remote",
      description: "Body",
      dedupeKey: "acme_engineer_remote",
      firstSeenAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
      lastSeenAt: new Date(),
      ghostRisk: 0.95,
      ghostReasons: ["listed 400 days"],
    });

    // Verified signature (services/analytics.service.ts:36-40):
    // logInteraction(userId, canonicalJobId, interactionType, feedbackComment?)
    await AnalyticsService.logInteraction(
      userId,
      String(job._id),
      "still_hiring",
    );

    const after = await CanonicalJob.findById(job._id).lean();
    expect(after?.userGhostVerdict).toBe("real");
    expect(after?.ghostRisk).toBe(0);
    expect(after?.ghostReasons).toEqual(["you marked this as still hiring"]);
    expect(after?.isActive).toBe(true);

    const logs = await JobInteractionLog.find({ canonicalJobId: job._id });
    expect(logs.map((l) => l.interactionType)).toContain("still_hiring");
  });
});
