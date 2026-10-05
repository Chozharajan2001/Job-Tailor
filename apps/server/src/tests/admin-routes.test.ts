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
import request from "supertest";
import mongoose from "mongoose";
import { SourceRegistry } from "../models/SourceRegistry.model.js";
import { connectTestDb, disconnectTestDb } from "./helpers/test-db.js";

process.env.NODE_ENV = "test";
process.env.SOURCE_POLL_ADMIN_KEY = "test-admin-key-32-chars-long!!-padded";

// Import the app AFTER setting the env var so config.sourcePollAdminKey
// picks it up at module load.
const { default: app } = await import("../app.js");

describe("POST /api/v1/admin/seed-sources", () => {
  beforeAll(async () => {
    await connectTestDb();
  });
  afterAll(async () => {
    await disconnectTestDb();
  });
  beforeEach(async () => {
    await SourceRegistry.deleteMany({ connectorType: { $ne: null } });
  });

  it("rejects missing x-admin-key with 401", async () => {
    const res = await request(app)
      .post("/api/v1/admin/seed-sources")
      .send({
        items: [{ name: "A", connectorType: "greenhouse", companyId: "a" }],
      });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED_ADMIN");
  });

  it("rejects bad x-admin-key with 401", async () => {
    const res = await request(app)
      .post("/api/v1/admin/seed-sources")
      .set("x-admin-key", "wrong-key")
      .send({
        items: [{ name: "A", connectorType: "greenhouse", companyId: "a" }],
      });
    expect(res.status).toBe(401);
  });

  it("rejects a malformed companyId with 400", async () => {
    const res = await request(app)
      .post("/api/v1/admin/seed-sources")
      .set("x-admin-key", process.env.SOURCE_POLL_ADMIN_KEY!)
      .send({
        items: [
          {
            name: "Attack",
            connectorType: "greenhouse",
            companyId: "../etc/passwd",
          },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_SEED_PAYLOAD");
  });

  it("rejects an empty items array with 400", async () => {
    const res = await request(app)
      .post("/api/v1/admin/seed-sources")
      .set("x-admin-key", process.env.SOURCE_POLL_ADMIN_KEY!)
      .send({ items: [] });
    expect(res.status).toBe(400);
  });

  it("accepts a valid payload with 201 and creates rows", async () => {
    const res = await request(app)
      .post("/api/v1/admin/seed-sources")
      .set("x-admin-key", process.env.SOURCE_POLL_ADMIN_KEY!)
      .send({
        items: [
          { name: "Acme", connectorType: "greenhouse", companyId: "acme" },
          { name: "Beta", connectorType: "lever", companyId: "beta" },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.created).toBe(2);
    const count = await SourceRegistry.countDocuments({
      connectorType: { $ne: null },
    });
    expect(count).toBe(2);
  });
});

describe("POST /api/v1/admin/poll-due-sources", () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) await connectTestDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects missing x-admin-key with 401", async () => {
    const res = await request(app).post("/api/v1/admin/poll-due-sources");
    expect(res.status).toBe(401);
  });

  it("returns a summary envelope when authenticated", async () => {
    // No sources are due in this state (nothing seeded).
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ jobs: [] }),
          }) as unknown as Response,
      ),
    );
    const res = await request(app)
      .post("/api/v1/admin/poll-due-sources")
      .set("x-admin-key", process.env.SOURCE_POLL_ADMIN_KEY!);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("due");
    expect(res.body.data).toHaveProperty("polled");
  });
});
