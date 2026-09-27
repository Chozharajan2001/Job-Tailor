import { describe, it, expect, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectTestDb, disconnectTestDb } from "./helpers/test-db.js";
import { Resume } from "../models/Resume.model.js";
import { User } from "../models/User.model.js";

process.env.NODE_ENV = "test";

describe("ATS score schema persistence", () => {
  let userId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    await connectTestDb();
    const u = await User.create({
      email: "schema-persist@test.co",
      passwordHash: bcrypt.hashSync("password123", 10),
      firstName: "S",
      lastName: "P",
      emailVerified: true,
    });
    userId = u._id;
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("persists semanticScoreDegraded and engineVersion on atsScore", async () => {
    const created = await Resume.create({
      userId,
      version: 1,
      versionLabel: "v1-test",
      tailoredSummary: "Summary text for schema test.",
      skills: [],
      experience: [],
      projects: [],
      atsScore: {
        overallScore: 53,
        keywordMatchScore: 50,
        semanticMatchScore: 0,
        sectionCompletenessScore: 55,
        formatScore: 60,
        semanticScoreDegraded: true,
        engineVersion: 2,
        breakdown: {
          matchedSkills: [],
          missingSkills: [],
          weakSkills: [],
          actionItems: [],
        },
      },
    });

    const reloaded = await Resume.findById(created._id).lean();
    expect(reloaded?.atsScore?.semanticScoreDegraded).toBe(true);
    expect(reloaded?.atsScore?.engineVersion).toBe(2);
  });
});
