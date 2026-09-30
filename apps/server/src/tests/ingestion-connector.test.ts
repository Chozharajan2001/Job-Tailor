import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import mongoose from "mongoose";
import { IngestionService } from "../services/ingestion.service.js";
import { SourceRegistry } from "../models/SourceRegistry.model.js";
import { CanonicalJob } from "../models/CanonicalJob.model.js";
import { connectTestDb, disconnectTestDb } from "./helpers/test-db.js";

process.env.NODE_ENV = "test";

describe("IngestionService — api_connector source type", () => {
  let testSource: mongoose.Document & { _id: mongoose.Types.ObjectId };

  beforeAll(async () => {
    await connectTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await CanonicalJob.deleteMany({});
    await SourceRegistry.deleteMany({ connectorType: { $ne: null } });
    // Ensure manual + public defaults exist so ensureDefaultSources doesn't
    // race with our per-test source creation.
    await IngestionService.ensureDefaultSources();
    testSource = await SourceRegistry.create({
      name: "Acme (Greenhouse)",
      sourceType: "api_connector",
      connectorType: "greenhouse",
      companyId: "acme",
      baseUrl: "https://boards-api.greenhouse.io",
      crawlFrequency: 360,
      extractionStrategy: "manual_input",
    });
  });

  it("creates a CanonicalJob linked to the connector source", async () => {
    const job = await IngestionService.ingestJob({
      sourceType: "api_connector",
      sourceName: "Acme (Greenhouse)",
      sourceId: String(testSource._id),
      companyName: "Acme",
      jobTitle: "Senior Engineer",
      location: "Remote",
      description: "Do engineering work on things.",
      sourceUrl: "https://gh/acme/1",
      applyUrl: "https://gh/acme/1",
    });

    expect(job.sourceId?.toString()).toBe(String(testSource._id));
    expect(job.sourceName).toBe("Acme (Greenhouse)");
    expect(job.extractionConfidence).toBe(0.9);
    expect(job.structuredJD).toBeUndefined();
  });

  it("throws when sourceId is missing for api_connector", async () => {
    await expect(
      IngestionService.ingestJob({
        sourceType: "api_connector",
        sourceName: "Ghost",
        companyName: "X",
        jobTitle: "Y",
        description: "Z long enough to be a job",
      }),
    ).rejects.toThrow(/sourceId/);
  });

  it("throws when sourceId points to a missing SourceRegistry row", async () => {
    const bogus = new mongoose.Types.ObjectId().toString();
    await expect(
      IngestionService.ingestJob({
        sourceType: "api_connector",
        sourceName: "Ghost",
        sourceId: bogus,
        companyName: "X",
        jobTitle: "Y",
        description: "Z long enough to be a job",
      }),
    ).rejects.toThrow(/not found/);
  });

  it("deduplicates two polls of the same external URL", async () => {
    const payload = {
      sourceType: "api_connector" as const,
      sourceName: "Acme (Greenhouse)",
      sourceId: String(testSource._id),
      companyName: "Acme",
      jobTitle: "Senior Engineer",
      location: "Remote",
      description: "Same body text across both polls.",
      sourceUrl: "https://gh/acme/dup",
      applyUrl: "https://gh/acme/dup",
    };
    const first = await IngestionService.ingestJob(payload);
    const second = await IngestionService.ingestJob(payload);
    expect(String(first._id)).toBe(String(second._id));
    const count = await CanonicalJob.countDocuments({
      applyUrl: "https://gh/acme/dup",
    });
    expect(count).toBe(1);
  });

  it("does not invoke the LLM JD parser at ingest time", async () => {
    // Stub parseJD before importing to prove it's never called on the
    // api_connector path. If it were, the mock would be hit.
    const parserMod = await import("../services/jd-parser.service.js");
    const spy = vi.spyOn(parserMod, "parseJD").mockResolvedValue({
      summary: "should not be used",
      seniorityLevel: "mid",
      focusWeights: {
        frontend: 0,
        backend: 0,
        devops: 0,
        ai: 0,
        mobile: 0,
      },
      requiredSkills: [],
      preferredSkills: [],
      responsibilities: [],
      qualifications: [],
      niceToHaves: [],
      tone: "technical",
    });

    await IngestionService.ingestJob({
      sourceType: "api_connector",
      sourceName: "Acme (Greenhouse)",
      sourceId: String(testSource._id),
      companyName: "Acme",
      jobTitle: "Engineer",
      location: "Remote",
      description:
        "Long body text that would otherwise trigger LLM parsing on manual paste.",
      sourceUrl: "https://gh/acme/llm",
      applyUrl: "https://gh/acme/llm",
    });

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // Live payloads sampled 2026-09-30: Ashby sends "FullTime" / "Temporary" /
  // "Intern" / "Contract", Lever sends "Full-time", RemoteOK puts role tags
  // first. None of them match CanonicalJob's lowercase-hyphen enum, so every
  // such posting died on the required validator inside the poller's `catch`.
  it("accepts provider employment-type casing instead of dropping the posting", async () => {
    const ashby = await IngestionService.ingestJob({
      sourceType: "api_connector",
      sourceName: "Acme (Ashby)",
      sourceId: String(testSource._id),
      companyName: "Acme",
      jobTitle: "Cloud Security Engineer",
      location: "Remote",
      description: "Harden the fleet.",
      sourceUrl: "https://ashby/acme/1",
      applyUrl: "https://ashby/acme/1",
      employmentType: "FullTime",
    });
    expect(ashby.employmentType).toBe("full-time");

    const intern = await IngestionService.ingestJob({
      sourceType: "api_connector",
      sourceName: "Acme (Ashby)",
      sourceId: String(testSource._id),
      companyName: "Acme",
      jobTitle: "Intern",
      location: "Remote",
      description: "Learn the fleet.",
      sourceUrl: "https://ashby/acme/2",
      applyUrl: "https://ashby/acme/2",
      employmentType: "Intern",
    });
    expect(intern.employmentType).toBe("internship");
  });

  it("leaves employmentType unset when the provider value is not one", async () => {
    const job = await IngestionService.ingestJob({
      sourceType: "api_connector",
      sourceName: "Acme (RemoteOK)",
      sourceId: String(testSource._id),
      companyName: "Acme",
      jobTitle: "Backend Engineer",
      location: "Remote",
      description: "Go things.",
      sourceUrl: "https://remoteok/acme/1",
      applyUrl: "https://remoteok/acme/1",
      employmentType: "golang",
    });

    expect(job.jobTitle).toBe("Backend Engineer");
    expect(job.employmentType).toBeUndefined();
  });
});
