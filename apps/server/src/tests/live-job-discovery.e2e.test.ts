import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import mongoose from "mongoose";
import { SourceRegistry } from "../models/SourceRegistry.model.js";
import { CanonicalJob } from "../models/CanonicalJob.model.js";
import { SearchService } from "../services/search.service.js";
import { seedSources } from "../services/source-seed.service.js";
import { pollDueSources } from "../services/source-poller.service.js";
import { connectTestDb, disconnectTestDb } from "./helpers/test-db.js";

process.env.NODE_ENV = "test";

/**
 * End-to-end smoke: seed → poll → search. Proves that once live sources
 * are registered, a real query returns rows from the ingested feed.
 */
describe("live job discovery — end to end", () => {
  beforeAll(async () => {
    await connectTestDb();
  });
  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await CanonicalJob.deleteMany({});
    await SourceRegistry.deleteMany({});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubGreenhouse(payloads: Record<string, unknown[]>) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const m = url.match(
          /boards-api\.greenhouse\.io\/v1\/boards\/([^/]+)\/jobs$/,
        );
        const token = m?.[1] ?? "";
        return {
          ok: true,
          status: 200,
          json: async () => ({ jobs: payloads[token] ?? [] }),
        } as unknown as Response;
      }),
    );
  }

  it("registers sources, polls them, and surfaces the results in search", async () => {
    // 1. Seed two greenhouse company rows.
    const seed = await seedSources([
      { name: "Acme", connectorType: "greenhouse", companyId: "acme" },
      { name: "Beta", connectorType: "greenhouse", companyId: "beta" },
    ]);
    expect(seed.created).toBe(2);

    // 2. Stub the API responses each company would return.
    stubGreenhouse({
      acme: [
        {
          id: 1,
          title: "Senior React Engineer",
          absolute_url: "https://gh/acme/1",
          location: { name: "Remote" },
          content: "<p>React and TypeScript</p>",
        },
        {
          id: 2,
          title: "Backend Engineer",
          absolute_url: "https://gh/acme/2",
          location: { name: "NYC" },
          content: "<p>Node and Postgres</p>",
        },
      ],
      beta: [
        {
          id: 11,
          title: "React Developer",
          absolute_url: "https://gh/beta/11",
          location: { name: "Remote" },
          content: "<p>Modern front-end</p>",
        },
      ],
    });

    // 3. Poll everything due.
    const summary = await pollDueSources();
    expect(summary.due).toBe(2);
    expect(summary.polled).toBe(2);
    const totalCreated = summary.results.reduce((a, r) => a + r.created, 0);
    expect(totalCreated).toBe(3);

    // 4. Verify rows landed with the right source linkage.
    const count = await CanonicalJob.countDocuments({ isActive: true });
    expect(count).toBe(3);
    const acmeJobs = await CanonicalJob.find({ companyName: "Acme" }).lean();
    expect(acmeJobs).toHaveLength(2);
    for (const j of acmeJobs) {
      expect(j.sourceId).toBeTruthy();
      expect(j.extractionConfidence).toBe(0.9);
    }

    // 5. Re-poll: reset lastPolledAt to force them due, then re-poll.
    //    Dedup in ingestJob means no new rows are created.
    await SourceRegistry.updateMany({}, { $set: { lastPolledAt: null } });
    const second = await pollDueSources();
    const totalDupes = second.results.reduce((a, r) => a + r.duplicates, 0);
    const totalNew = second.results.reduce((a, r) => a + r.created, 0);
    expect(totalNew).toBe(0);
    expect(totalDupes).toBe(3);

    // 6. Search surfaces the ingested jobs.
    const results = await SearchService.searchJobs({
      q: "React",
      userId: new mongoose.Types.ObjectId().toString(),
    });
    const titles = results.jobs.map((r: { jobTitle: string }) => r.jobTitle);
    expect(titles).toContain("Senior React Engineer");
    expect(titles).toContain("React Developer");
  });

  it("circuit-breaks a dead source without stopping the batch", async () => {
    await seedSources([
      { name: "Dead", connectorType: "greenhouse", companyId: "dead" },
      { name: "Alive", connectorType: "greenhouse", companyId: "alive" },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/dead/")) {
          return { ok: false, status: 404 } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            jobs: [
              {
                id: 1,
                title: "Ok",
                absolute_url: "https://gh/alive/1",
                location: { name: "Remote" },
                content: "<p>body</p>",
              },
            ],
          }),
        } as unknown as Response;
      }),
    );

    for (let i = 0; i < 5; i++) {
      await SourceRegistry.updateMany({}, { $set: { lastPolledAt: null } });
      await pollDueSources();
    }
    const dead = await SourceRegistry.findOne({ companyId: "dead" }).lean();
    const alive = await SourceRegistry.findOne({ companyId: "alive" }).lean();
    expect(dead?.isEnabled).toBe(false);
    expect(alive?.isEnabled).toBe(true);
    expect(alive?.errorCount).toBe(0);
  });
});
