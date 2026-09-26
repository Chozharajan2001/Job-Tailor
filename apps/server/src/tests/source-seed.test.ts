import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { SourceRegistry } from "../models/SourceRegistry.model.js";
import { seedSources } from "../services/source-seed.service.js";
import { connectTestDb, disconnectTestDb } from "./helpers/test-db.js";

process.env.NODE_ENV = "test";

describe("seedSources", () => {
  beforeAll(async () => {
    await connectTestDb();
  });
  afterAll(async () => {
    await disconnectTestDb();
  });
  beforeEach(async () => {
    await SourceRegistry.deleteMany({ connectorType: { $ne: null } });
  });

  it("creates new connector rows for fresh items", async () => {
    const summary = await seedSources([
      { name: "Acme", connectorType: "greenhouse", companyId: "acme" },
      { name: "Beta", connectorType: "lever", companyId: "beta" },
    ]);
    expect(summary.created).toBe(2);
    expect(summary.updated).toBe(0);
    const rows = await SourceRegistry.find({
      connectorType: { $ne: null },
    }).lean();
    expect(rows).toHaveLength(2);
    expect(rows[0].sourceType).toBe("api_connector");
    expect(rows[0].baseUrl).toMatch(/https:\/\//);
  });

  it("is idempotent: re-seed updates instead of duplicating", async () => {
    await seedSources([
      { name: "Acme", connectorType: "greenhouse", companyId: "acme" },
    ]);
    const summary = await seedSources([
      {
        name: "Acme Renamed",
        connectorType: "greenhouse",
        companyId: "acme",
        crawlFrequency: 720,
      },
    ]);
    expect(summary.created).toBe(0);
    expect(summary.updated).toBe(1);
    const rows = await SourceRegistry.find({
      connectorType: "greenhouse",
      companyId: "acme",
    }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Acme Renamed");
    expect(rows[0].crawlFrequency).toBe(720);
  });

  it("skips items missing required fields", async () => {
    const summary = await seedSources([
      { name: "", connectorType: "greenhouse", companyId: "x" },
      { name: "Ok", connectorType: "greenhouse", companyId: "" },
    ]);
    expect(summary.skipped).toBe(2);
    expect(summary.created).toBe(0);
  });

  it("handles a mixed batch: creates new, updates existing, skips bad", async () => {
    await seedSources([
      { name: "Original", connectorType: "ashby", companyId: "notion" },
    ]);
    const summary = await seedSources([
      { name: "Renamed Notion", connectorType: "ashby", companyId: "notion" },
      { name: "New Linear", connectorType: "ashby", companyId: "linear" },
      { name: "", connectorType: "lever", companyId: "bad" },
    ]);
    expect(summary).toMatchObject({ created: 1, updated: 1, skipped: 1 });
  });
});
