import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { CanonicalJob } from "../models/CanonicalJob.model.js";
import { SearchService } from "../services/search.service.js";
import { connectTestDb, disconnectTestDb } from "./helpers/test-db.js";

process.env.NODE_ENV = "test";

describe("ghost demotion in search ranking", () => {
  beforeAll(async () => {
    await connectTestDb();
  });
  afterAll(async () => {
    await disconnectTestDb();
  });
  beforeEach(async () => {
    await CanonicalJob.deleteMany({});
    const base = {
      sourceName: "Acme (Greenhouse)",
      companyName: "Acme",
      workType: "remote",
      location: "Remote",
      description: "React engineer role with TypeScript.",
      isActive: true,
      verificationState: "unverified",
    };
    await CanonicalJob.create({
      ...base,
      jobTitle: "React Engineer",
      dedupeKey: "clean",
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      ghostRisk: 0,
    });
    await CanonicalJob.create({
      ...base,
      jobTitle: "React Engineer Ghost",
      dedupeKey: "ghosty",
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      ghostRisk: 0.9,
    });
  });

  it("demotes a high-risk listing below the clean one but keeps it reachable", async () => {
    // "React" inclusion-matches both titles, so without the demotion the
    // scores tie and the strict inequality below must fail.
    const res = await SearchService.searchJobs({ q: "React" });
    const titles = res.jobs.map((j: { jobTitle: string }) => j.jobTitle);
    expect(titles).toContain("React Engineer Ghost");
    expect(titles.indexOf("React Engineer")).toBeLessThan(
      titles.indexOf("React Engineer Ghost"),
    );
    const clean = res.jobs.find(
      (j: { jobTitle: string }) => j.jobTitle === "React Engineer",
    ) as {
      relevanceScore: number;
    };
    const ghost = res.jobs.find(
      (j: { jobTitle: string }) => j.jobTitle === "React Engineer Ghost",
    ) as { relevanceScore: number };
    expect(clean.relevanceScore).toBeGreaterThan(ghost.relevanceScore);
  });

  it("drops it only when the user opts in", async () => {
    const res = await SearchService.searchJobs({
      q: "React Engineer",
      hideGhosts: true,
    });
    const titles = res.jobs.map((j: { jobTitle: string }) => j.jobTitle);
    expect(titles).not.toContain("React Engineer Ghost");
  });

  it("keeps untagged listings when the filter is on", async () => {
    await CanonicalJob.deleteMany({});
    await CanonicalJob.create({
      sourceName: "Acme (Greenhouse)",
      companyName: "Acme",
      jobTitle: "Untagged Engineer",
      workType: "remote",
      location: "Remote",
      description: "React engineer role with TypeScript.",
      isActive: true,
      verificationState: "unverified",
      dedupeKey: "untagged",
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    });
    const res = await SearchService.searchJobs({
      q: "Engineer",
      hideGhosts: true,
    });
    const titles = res.jobs.map((j: { jobTitle: string }) => j.jobTitle);
    expect(titles).toContain("Untagged Engineer");
  });
});
