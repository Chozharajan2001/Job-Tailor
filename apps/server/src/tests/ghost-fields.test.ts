import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { CanonicalJob } from "../models/CanonicalJob.model.js";
import { connectTestDb, disconnectTestDb } from "./helpers/test-db.js";

process.env.NODE_ENV = "test";

describe("CanonicalJob ghost fields", () => {
  beforeAll(async () => {
    await connectTestDb();
  });
  afterAll(async () => {
    await disconnectTestDb();
  });
  beforeEach(async () => {
    await CanonicalJob.deleteMany({});
  });

  it("persists and re-reads every ghost field (strict mode guard)", async () => {
    const created = await CanonicalJob.create({
      sourceName: "Acme (Greenhouse)",
      companyName: "Acme",
      jobTitle: "Engineer",
      location: "Remote",
      workType: "remote",
      description: "Body text",
      dedupeKey: "acme_engineer_remote",
      ghostRisk: 0.55,
      ghostReasons: ["listed for 90 days", "unchanged text"],
      ghostEvaluatedAt: new Date("2026-09-30T00:00:00.000Z"),
      userGhostVerdict: "real",
    });

    const reread = await CanonicalJob.findById(created._id).lean();
    expect(reread?.ghostRisk).toBe(0.55);
    expect(reread?.ghostReasons).toEqual([
      "listed for 90 days",
      "unchanged text",
    ]);
    expect(reread?.ghostEvaluatedAt).toBeInstanceOf(Date);
    expect(reread?.userGhostVerdict).toBe("real");
  });

  it("rejects an unknown userGhostVerdict", async () => {
    await expect(
      CanonicalJob.create({
        sourceName: "Acme (Greenhouse)",
        companyName: "B",
        jobTitle: "X",
        location: "Remote",
        workType: "remote",
        description: "Body",
        dedupeKey: "b_x_remote",
        userGhostVerdict: "maybe",
      }),
    ).rejects.toThrow(/userGhostVerdict/);
  });
});
