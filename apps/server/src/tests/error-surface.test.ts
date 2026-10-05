import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import mongoose from "mongoose";
import * as searchController from "../controllers/search.controller.js";
import * as jobController from "../controllers/job.controller.js";
import * as resumeController from "../controllers/resume.controller.js";
import * as analyticsController from "../controllers/analytics.controller.js";
import { IngestionService } from "../services/ingestion.service.js";
import { AnalyticsService } from "../services/analytics.service.js";
import { Job } from "../models/Job.model.js";
import { Profile } from "../models/Profile.model.js";
import { Resume } from "../models/Resume.model.js";
import { User } from "../models/User.model.js";
import { connectTestDb, disconnectTestDb } from "./helpers/test-db.js";

process.env.NODE_ENV = "test";

/**
 * M2: a controller that puts `err.message` into a 5xx body tells the caller
 * WHY the request failed for reasons they cannot see otherwise. For the ingest
 * path that is an SSRF oracle (the message distinguishes "resolves to a
 * private/internal address" from a plain fetch failure), and elsewhere the
 * message carries provider errors, Mongoose paths and collection names.
 *
 * Every case below fails the underlying work with a message that contains a
 * distinctive internal string, then asserts the response body neither carries
 * that string nor any schema/provider vocabulary, while keeping the status
 * code and machine-readable error code the client already depends on.
 */
const INTERNAL_DETAIL =
  "URL resolves to a private/internal address at 169.254.169.254 (model=Resume path=userId)";

// Mocked at the provider boundary so the failure is deterministic and never
// reaches a real AI service or the network.
vi.mock("../services/jd-parser.service.js", () => ({
  parseJD: () => Promise.reject(new Error(INTERNAL_DETAIL)),
}));

vi.mock("../services/resume-tailor.service.js", () => ({
  tailorResume: () => Promise.reject(new Error(INTERNAL_DETAIL)),
}));

vi.mock("../services/pdf-generator.service.js", () => ({
  generatePDF: () => Promise.reject(new Error(INTERNAL_DETAIL)),
  uploadToCloudinary: () => Promise.reject(new Error(INTERNAL_DETAIL)),
}));

interface Capture {
  status: number;
  body: any;
}

/** Chainable res stub matching the shape used by the other controller suites. */
function capture() {
  const out: Capture = { status: 200, body: null };
  const res = {
    status: (code: number) => {
      out.status = code;
      return res;
    },
    json: (body: any) => {
      out.body = body;
      return res;
    },
  } as any;
  return { out, res };
}

function expectStatic5xx(out: Capture, statusCode: number, code: string) {
  expect(out.status).toBe(statusCode);
  expect(out.body.success).toBe(false);
  expect(out.body.error.code).toBe(code);
  const serialized = JSON.stringify(out.body);
  expect(serialized).not.toContain("169.254");
  expect(serialized).not.toMatch(/private\/internal/i);
  expect(serialized).not.toContain(INTERNAL_DETAIL);
  // Mongoose cast failures name the model, the path and the offending value;
  // that is exactly the schema detail a 5xx body must not carry.
  expect(serialized).not.toMatch(/Cast to /);
  expect(serialized).not.toMatch(/for model\s"/);
  expect(serialized).not.toMatch(/at path\s"/);
  expect(serialized).not.toContain("not-an-object-id");
  expect(typeof out.body.error.message).toBe("string");
  expect(out.body.error.message.length).toBeGreaterThan(0);
}

let userId: string;
let jobId: string;
let resumeId: string;

beforeAll(async () => {
  await connectTestDb();

  const user = await User.create({
    email: "error-surface@example.com",
    passwordHash:
      "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345",
    firstName: "Error",
    lastName: "Surface",
  });
  userId = (user._id as mongoose.Types.ObjectId).toString();

  await Profile.create({
    userId: user._id,
    summary: "Summary",
    skills: [],
    experience: [],
    projects: [],
    education: [],
    certifications: [],
    links: {},
  });

  const job = await Job.create({
    userId: user._id,
    companyName: "Leak Corp",
    jobTitle: "Engineer",
    jdRawText: "Build things.",
    status: "saved",
    parsedJD: {
      summary: "Parsed summary.",
      requiredSkills: ["Node.js"],
      preferredSkills: [],
      responsibilities: [],
      qualifications: [],
      niceToHaves: [],
      tone: "technical",
    },
  });
  jobId = (job._id as mongoose.Types.ObjectId).toString();

  const resume = await Resume.create({
    userId: user._id,
    jobId: job._id,
    version: 1,
    versionLabel: "v1",
    tailoredSummary: "Tailored summary.",
    skills: [],
    experience: [],
    projects: [],
    sectionOrder: ["summary"],
    status: "generated",
  });
  resumeId = (resume._id as mongoose.Types.ObjectId).toString();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe("M2 ingestUrl (SSRF oracle)", () => {
  it("returns a static body when ingestion fails", async () => {
    const spy = vi
      .spyOn(IngestionService, "ingestFromUrl")
      .mockRejectedValue(new Error(INTERNAL_DETAIL));
    const { out, res } = capture();

    await searchController.ingestUrl(
      { body: { url: "https://example.com/jobs/1" } } as any,
      res,
    );

    expectStatic5xx(out, 500, "INGESTION_FAILED");
    spy.mockRestore();
  });
});

describe("M2 parseJobJD", () => {
  it("returns a static 502 when JD parsing fails", async () => {
    const { out, res } = capture();

    await jobController.parseJobJD(
      { user: { userId }, params: { id: jobId } } as any,
      res,
    );

    expectStatic5xx(out, 502, "JD_PARSE_FAILED");
  });
});

describe("M2 generateResume", () => {
  it("returns a static body when the tailor engine fails", async () => {
    const { out, res } = capture();

    await resumeController.generateResume(
      { user: { userId }, body: { jobId } } as any,
      res,
    );

    expectStatic5xx(out, 500, "RESUME_GENERATION_FAILED");
  });
});

describe("M2 downloadPDF", () => {
  it("returns a static body when PDF rendering fails", async () => {
    const { out, res } = capture();

    await resumeController.downloadPDF(
      { user: { userId }, params: { id: resumeId } } as any,
      res,
    );

    expectStatic5xx(out, 500, "PDF_GENERATION_FAILED");
  });
});

describe("M2 profile resume create/update", () => {
  it("returns a static body when the create cast fails", async () => {
    const { out, res } = capture();

    await resumeController.createProfileResume(
      {
        user: { userId: "not-an-object-id" },
        body: { versionLabel: "v1", tailoredSummary: "s", skills: [] },
      } as any,
      res,
    );

    expectStatic5xx(out, 500, "PROFILE_RESUME_CREATION_FAILED");
  });

  it("returns a static body when the update cast fails", async () => {
    const { out, res } = capture();

    await resumeController.updateProfileResume(
      { user: { userId: "not-an-object-id" }, body: {} } as any,
      res,
    );

    expectStatic5xx(out, 500, "PROFILE_RESUME_UPDATE_FAILED");
  });
});

describe("M2 analytics feedback and dashboard paths", () => {
  it("trackSearchClick returns a static body", async () => {
    const spy = vi
      .spyOn(AnalyticsService, "logInteraction")
      .mockRejectedValue(new Error(INTERNAL_DETAIL));
    const { out, res } = capture();

    await analyticsController.trackSearchClick(
      {
        user: { userId },
        body: { canonicalJobId: new mongoose.Types.ObjectId().toString() },
      } as any,
      res,
    );

    expectStatic5xx(out, 500, "INTERNAL_ERROR");
    spy.mockRestore();
  });

  it("submitFeedback returns a static body", async () => {
    const spy = vi
      .spyOn(AnalyticsService, "logInteraction")
      .mockRejectedValue(new Error(INTERNAL_DETAIL));
    const { out, res } = capture();

    await analyticsController.submitFeedback(
      {
        user: { userId },
        body: {
          canonicalJobId: new mongoose.Types.ObjectId().toString(),
          interactionType: "still_hiring",
        },
      } as any,
      res,
    );

    expectStatic5xx(out, 500, "INTERNAL_ERROR");
    spy.mockRestore();
  });

  it("getDashboardStats returns a static body", async () => {
    const spy = vi
      .spyOn(AnalyticsService, "getAnalyticsDashboard")
      .mockRejectedValue(new Error(INTERNAL_DETAIL));
    const { out, res } = capture();

    await analyticsController.getDashboardStats({} as any, res);

    expectStatic5xx(out, 500, "INTERNAL_ERROR");
    spy.mockRestore();
  });

  it("updateSourceTrustManual returns a static body", async () => {
    const { SourceRegistry } =
      await import("../models/SourceRegistry.model.js");
    const findSpy = vi
      .spyOn(SourceRegistry, "findById")
      .mockRejectedValue(new Error(INTERNAL_DETAIL));
    const { out, res } = capture();

    await analyticsController.updateSourceTrustManual(
      {
        params: { id: new mongoose.Types.ObjectId().toString() },
        body: { trustScore: 0.5 },
      } as any,
      res,
    );

    expectStatic5xx(out, 500, "INTERNAL_ERROR");
    findSpy.mockRestore();
  });
});
