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
import {
  pollSource,
  pollDueSources,
} from "../services/source-poller.service.js";
import { runWithConcurrency } from "../services/source-poller.util.js";
import { connectTestDb, disconnectTestDb } from "./helpers/test-db.js";

process.env.NODE_ENV = "test";

describe("runWithConcurrency", () => {
  it("respects the concurrency limit and preserves result order", async () => {
    let running = 0;
    let max = 0;
    const results = await runWithConcurrency(
      [1, 2, 3, 4, 5, 6, 7],
      3,
      async (n) => {
        running++;
        max = Math.max(max, running);
        await new Promise((r) => setTimeout(r, 5 * n));
        running--;
        return n * 10;
      },
    );
    expect(results).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect(max).toBeLessThanOrEqual(3);
  });

  it("throws on non-positive limit", async () => {
    await expect(runWithConcurrency([1], 0, async (x) => x)).rejects.toThrow(
      /limit/,
    );
  });

  it("handles empty input", async () => {
    expect(await runWithConcurrency([], 3, async (x) => x)).toEqual([]);
  });
});

describe("source-poller", () => {
  let testSourceId: string;

  beforeAll(async () => {
    await connectTestDb();
  });
  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await CanonicalJob.deleteMany({});
    await SourceRegistry.deleteMany({ connectorType: { $ne: null } });
    const src = await SourceRegistry.create({
      name: "Acme (Greenhouse)",
      sourceType: "api_connector",
      connectorType: "greenhouse",
      companyId: "acme",
      baseUrl: "https://boards-api.greenhouse.io",
      crawlFrequency: 360,
      extractionStrategy: "manual_input",
      trustScore: 0.5,
    });
    testSourceId = String(src._id);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockGreenhouseList(jobs: unknown[]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (
          url.startsWith("https://boards-api.greenhouse.io/v1/boards/acme/jobs")
        ) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ jobs }),
          } as unknown as Response;
        }
        return { ok: false, status: 404 } as unknown as Response;
      }),
    );
  }

  function mockGreenhouseFailure() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response),
    );
  }

  it("creates CanonicalJobs on a successful first poll", async () => {
    mockGreenhouseList([
      {
        id: 1,
        title: "Eng",
        absolute_url: "https://gh/acme/1",
        location: { name: "Remote" },
        content: "<p>Build things.</p>",
      },
      {
        id: 2,
        title: "PM",
        absolute_url: "https://gh/acme/2",
        location: { name: "NYC" },
        content: "<p>Plan things.</p>",
      },
    ]);

    const result = await pollSource(testSourceId);
    expect(result.created).toBe(2);
    expect(result.duplicates).toBe(0);
    const count = await CanonicalJob.countDocuments({
      sourceId: new mongoose.Types.ObjectId(testSourceId),
    });
    expect(count).toBe(2);
  });

  it("reports duplicates on a second poll of the same list", async () => {
    const same = [
      {
        id: 1,
        title: "Eng",
        absolute_url: "https://gh/acme/dup",
        location: { name: "Remote" },
        content: "<p>same body</p>",
      },
    ];
    mockGreenhouseList(same);
    await pollSource(testSourceId);
    mockGreenhouseList(same);
    const second = await pollSource(testSourceId);
    expect(second.created).toBe(0);
    expect(second.duplicates).toBe(1);
  });

  it("boosts trust and resets errorCount on success", async () => {
    mockGreenhouseList([]);
    // Seed an errorCount to verify it resets.
    await SourceRegistry.updateOne(
      { _id: testSourceId },
      { $set: { errorCount: 3 } },
    );

    await pollSource(testSourceId);
    const src = await SourceRegistry.findById(testSourceId).lean();
    expect(src?.errorCount).toBe(0);
    expect(src?.trustScore).toBeGreaterThan(0.5);
    expect(src?.lastPolledAt).toBeInstanceOf(Date);
  });

  it("decays trust and increments errorCount on failure", async () => {
    mockGreenhouseFailure();
    await pollSource(testSourceId);
    const src = await SourceRegistry.findById(testSourceId).lean();
    expect(src?.errorCount).toBe(1);
    expect(src?.trustScore).toBeLessThan(0.5);
    expect(src?.lastError).toMatch(/500/);
  });

  it("treats fetched-but-zero-ingested as a source failure, not a healthy poll (H3)", async () => {
    // Jobs whose description is empty fail CanonicalJob's required validator
    // per-item — historically the content-less Greenhouse list payload case.
    mockGreenhouseList([
      { id: 1, title: "No content", absolute_url: "https://gh/acme/nc1" },
      { id: 2, title: "No content", absolute_url: "https://gh/acme/nc2" },
    ]);

    const result = await pollSource(testSourceId);
    expect(result.fetched).toBe(2);
    expect(result.created).toBe(0);
    expect(result.error).toMatch(/ingested 0/);

    const src = await SourceRegistry.findById(testSourceId).lean();
    expect(src?.errorCount).toBe(1);
    expect(src?.trustScore).toBeLessThan(0.5);
    expect(src?.lastError).toMatch(/ingested 0/);
  });

  it("circuit-breaks after 5 consecutive failures", async () => {
    mockGreenhouseFailure();
    for (let i = 0; i < 5; i++) {
      await pollSource(testSourceId);
    }
    const src = await SourceRegistry.findById(testSourceId).lean();
    expect(src?.errorCount).toBe(5);
    expect(src?.isEnabled).toBe(false);
  });

  it("pollDueSources returns zero when nothing is due", async () => {
    await SourceRegistry.updateOne(
      { _id: testSourceId },
      { $set: { lastPolledAt: new Date() } },
    );
    const summary = await pollDueSources();
    expect(summary.due).toBe(0);
    expect(summary.polled).toBe(0);
  });

  it("pollDueSources picks up never-polled connector sources", async () => {
    mockGreenhouseList([]);
    const summary = await pollDueSources();
    expect(summary.due).toBeGreaterThanOrEqual(1);
    const src = await SourceRegistry.findById(testSourceId).lean();
    expect(src?.lastPolledAt).toBeInstanceOf(Date);
  });
});
