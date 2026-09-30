import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { CanonicalJob } from "../models/CanonicalJob.model.js";
import { applyGhostScoring } from "../services/ghost-job.service.js";
import { connectTestDb, disconnectTestDb } from "./helpers/test-db.js";

process.env.NODE_ENV = "test";

const DAY = 24 * 60 * 60 * 1000;
const seed = (over: Record<string, unknown>) =>
  CanonicalJob.create({
    sourceName: "Acme (Greenhouse)",
    companyName: "Acme",
    jobTitle: "Engineer",
    location: "Remote",
    workType: "remote",
    description: "Build things.",
    isActive: true,
    verificationState: "verified",
    firstSeenAt: new Date(Date.now() - 5 * DAY),
    lastSeenAt: new Date(),
    dedupeKey: `acme_engineer_${Math.random().toString(36).slice(2)}`,
    ...over,
  });

describe("applyGhostScoring", () => {
  beforeAll(async () => {
    await connectTestDb();
  });
  afterAll(async () => {
    await disconnectTestDb();
  });
  beforeEach(async () => {
    await CanonicalJob.deleteMany({});
  });

  it("scores stale listings and leaves fresh ones near zero", async () => {
    const stale = await seed({ firstSeenAt: new Date(Date.now() - 120 * DAY) });
    const fresh = await seed({
      jobTitle: "Fresh Eng",
      firstSeenAt: new Date(Date.now() - 2 * DAY),
    });

    const { evaluated } = await applyGhostScoring();
    expect(evaluated).toBe(2);

    const s = await CanonicalJob.findById(stale._id).lean();
    const f = await CanonicalJob.findById(fresh._id).lean();
    expect(s?.ghostRisk ?? 0).toBeGreaterThan(0.5);
    expect(s?.ghostReasons).toContain("listed 120 days");
    expect(s?.ghostEvaluatedAt).toBeInstanceOf(Date);
    expect(f?.ghostRisk ?? 0).toBeLessThan(0.1);
  });

  it("never deactivates or changes verificationState", async () => {
    const stale = await seed({
      firstSeenAt: new Date(Date.now() - 200 * DAY),
    });
    await applyGhostScoring();
    const after = await CanonicalJob.findById(stale._id).lean();
    expect(after?.isActive).toBe(true);
    expect(after?.verificationState).toBe("verified");
  });

  it("counts repost churn for the same company/title/location", async () => {
    for (let i = 0; i < 3; i++) {
      await seed({
        jobTitle: "Reposted Eng",
        firstSeenAt: new Date(Date.now() - 120 * DAY),
      });
    }
    await applyGhostScoring();
    const rows = await CanonicalJob.find({ jobTitle: "Reposted Eng" }).lean();
    expect(rows[0]?.ghostReasons).toContain("reposted 3 times");
  });

  it("respects a user verdict", async () => {
    const pinned = await seed({
      firstSeenAt: new Date(Date.now() - 300 * DAY),
      userGhostVerdict: "real",
    });
    await applyGhostScoring();
    const after = await CanonicalJob.findById(pinned._id).lean();
    expect(after?.ghostRisk).toBe(0);
    expect(after?.ghostReasons).toEqual(["you marked this as still hiring"]);
  });

  it("skips inactive listings", async () => {
    await seed({ isActive: false });
    const { evaluated } = await applyGhostScoring();
    expect(evaluated).toBe(0);
  });

  it("does not fire the unchanged signal on a first sighting", async () => {
    // Baseline rule: a row first seen today has a 0 change counter because
    // there is no history yet — that must not read as "text unchanged".
    const firstSeen = await seed({
      firstSeenAt: new Date(Date.now() - 2 * 60 * 1000),
      lastSeenAt: new Date(Date.now() - 2 * 60 * 1000),
      postedDate: new Date(Date.now() - 200 * DAY),
    });
    await applyGhostScoring();
    const after = await CanonicalJob.findById(firstSeen._id).lean();
    expect(after?.ghostReasons).not.toContain("text unchanged");
    expect(after?.ghostReasons).toContain("listed 200 days");
  });
});
