import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import bcrypt from "bcryptjs";
import { connectTestDb, disconnectTestDb } from "./helpers/test-db.js";
import { Resume } from "../models/Resume.model.js";
import { Job } from "../models/Job.model.js";
import { User } from "../models/User.model.js";
import { rescoreResume } from "../controllers/resume-rescore.controller.js";

process.env.NODE_ENV = "test";

// Deterministic semantic phase: provider fails → degraded math, no AI calls.
vi.mock("../services/ai-provider/provider-manager.js", () => ({
  aiProviderManager: {
    generateStructuredOutput: vi
      .fn()
      .mockRejectedValue(new Error("rescore test: provider off")),
  },
}));

const OTHER_USER_ID = "507f1f77bcf86cd799439011";

function makeApp(userId: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { userId, email: "t@t.co" };
    next();
  });
  app.post("/resumes/:id/rescore", rescoreResume);
  return app;
}

const parsedJD = {
  summary: "Frontend platform role",
  seniorityLevel: "mid",
  focusWeights: { frontend: 100, backend: 0, devops: 0, ai: 0, mobile: 0 },
  requiredSkills: ["React", "TypeScript"],
  preferredSkills: [],
  responsibilities: [],
  qualifications: [],
  niceToHaves: [],
  tone: "technical",
};

describe("POST /resumes/:id/rescore", () => {
  let userId: string;
  let resumeId: string;

  beforeAll(async () => {
    await connectTestDb();
    const u = await User.create({
      email: "rescore@test.co",
      passwordHash: bcrypt.hashSync("password123", 10),
      firstName: "R",
      lastName: "S",
      emailVerified: true,
    });
    userId = String(u._id);
    const job = await Job.create({
      userId: u._id,
      companyName: "Beta",
      jobTitle: "Frontend Engineer",
      jdRawText: "Build React.js dashboards and TS tooling at scale.",
      parsedJD,
    });
    const resume = await Resume.create({
      userId: u._id,
      jobId: job._id,
      version: 1,
      versionLabel: "v1-stored",
      tailoredSummary: "Built React.js dashboards and TS tooling.",
      skills: [
        {
          name: "React.js",
          category: "frontend",
          yearsOfExperience: 2,
          proficiency: "advanced",
        },
      ],
      experience: [
        {
          company: "Beta",
          role: "FE",
          startDate: "2023",
          endDate: null,
          location: "Remote",
          isCurrentRole: true,
          bullets: [
            { id: "b1", text: "Shipped React.js component library.", tags: [] },
          ],
        },
      ],
      projects: [],
      // v1-era stored score (golden case B v1 values), no engineVersion field
      atsScore: {
        overallScore: 53,
        keywordMatchScore: 50,
        semanticMatchScore: 0,
        sectionCompletenessScore: 55,
        formatScore: 60,
        semanticScoreDegraded: true,
        breakdown: {
          matchedSkills: [],
          missingSkills: [],
          weakSkills: [],
          actionItems: [],
        },
      },
    });
    resumeId = String(resume._id);
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it("returns stored vs fresh with delta and never overwrites", async () => {
    const res = await request(makeApp(userId)).post(
      `/resumes/${resumeId}/rescore`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.overwritten).toBe(false);
    expect(res.body.data.stored).toMatchObject({
      overallScore: 53,
      engineVersion: null,
    });
    expect(res.body.data.fresh.engineVersion).toBe(2);
    // Golden case B v2 math: TypeScript synonym-matches "TS" → keyword 95
    expect(res.body.data.fresh.keywordMatchScore).toBe(95);
    expect(res.body.data.delta.keywordMatchScore).toBe(45);
    expect(res.body.data.delta.overallScore).toBe(25); // 78 - 53

    const reloaded = await Resume.findById(resumeId).lean();
    expect(reloaded?.atsScore?.overallScore).toBe(53); // untouched
    expect(reloaded?.atsScore?.engineVersion).toBeUndefined();
  });

  it("404s for another user's resume", async () => {
    const res = await request(makeApp(OTHER_USER_ID)).post(
      `/resumes/${resumeId}/rescore`,
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("RESUME_NOT_FOUND");
  });

  it("400s when the job has no parsedJD", async () => {
    const job2 = await Job.create({
      userId,
      companyName: "NoParse",
      jobTitle: "Role",
      jdRawText: "raw text only",
    });
    const r2 = await Resume.create({
      userId,
      jobId: job2._id,
      version: 1,
      versionLabel: "v1-noparse",
      tailoredSummary: "Summary.",
      skills: [],
      experience: [],
      projects: [],
    });
    const res = await request(makeApp(userId)).post(
      `/resumes/${r2._id}/rescore`,
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("JD_NOT_PARSED");
  });
});
