import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import mongoose from "mongoose";
import { generateApiKey, hashApiKey } from "../utils/api-key.js";
import { ApiKey } from "../models/ApiKey.model.js";
import { AuditLog } from "../models/AuditLog.model.js";
import { User } from "../models/User.model.js";
import { authenticateByApiKey } from "../middleware/api-key-auth.js";
import {
  issueApiKey,
  listApiKeys,
  revokeApiKey,
} from "../controllers/apikey.controller.js";
import { changePassword, resetPassword } from "../services/auth.service.js";
import { connectTestDb, disconnectTestDb } from "./helpers/test-db.js";

process.env.NODE_ENV = "test";

// The User schema validates that passwordHash is a real bcrypt hash,
// so tests must generate one rather than using a placeholder string.
const validHash = bcrypt.hashSync("password-for-tests-only", 10);

describe("api-key utils", () => {
  it("produces a raw with a stable jtk_ prefix", () => {
    const { raw, prefix } = generateApiKey();
    expect(raw).toMatch(/^jtk_[a-f0-9]{40}$/);
    expect(prefix).toBe(raw.slice(0, 8));
  });

  it("hashing the same raw is idempotent and does not equal the raw", () => {
    const { raw, hash } = generateApiKey();
    expect(hashApiKey(raw)).toBe(hash);
    expect(hash).not.toBe(raw);
    expect(hash).toMatch(/^[a-f0-9]{64}$/); // sha256 hex
  });

  it("generates distinct raws on each call", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).not.toBe(b.hash);
  });
});

function makePingApp() {
  const app = express();
  app.get("/ping", authenticateByApiKey, (req, res) => {
    res.json({ ok: true, userId: req.user?.userId, email: req.user?.email });
  });
  return app;
}

describe("authenticateByApiKey", () => {
  beforeAll(async () => {
    await connectTestDb();
  });
  afterAll(async () => {
    await disconnectTestDb();
  });
  beforeEach(async () => {
    await ApiKey.deleteMany({});
    await User.deleteMany({});
  });

  it("rejects missing header with 401", async () => {
    const r = await request(makePingApp()).get("/ping");
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("AUTH_MISSING_API_KEY");
  });

  it("accepts a valid raw key and populates req.user", async () => {
    const user = await User.create({
      email: "a@b.co",
      passwordHash: validHash,
      firstName: "A",
      lastName: "B",
      emailVerified: true,
    });
    const { raw, hash, prefix } = generateApiKey();
    await ApiKey.create({
      userId: user._id,
      name: "test",
      keyHash: hash,
      prefix,
    });
    const r = await request(makePingApp()).get("/ping").set("x-api-key", raw);
    expect(r.status).toBe(200);
    expect(r.body.userId).toBe(String(user._id));
    expect(r.body.email).toBe("a@b.co");
  });

  it("rejects unknown key with 401", async () => {
    const { raw } = generateApiKey();
    const r = await request(makePingApp()).get("/ping").set("x-api-key", raw);
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("AUTH_INVALID_API_KEY");
  });

  it("rejects a valid key whose owner is deactivated (H2)", async () => {
    const user = await User.create({
      email: "deact@b.co",
      passwordHash: validHash,
      firstName: "D",
      lastName: "B",
      emailVerified: true,
      isActive: false,
    });
    const { raw, hash, prefix } = generateApiKey();
    await ApiKey.create({
      userId: user._id,
      name: "deact",
      keyHash: hash,
      prefix,
    });
    const r = await request(makePingApp()).get("/ping").set("x-api-key", raw);
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("AUTH_USER_DEACTIVATED");
  });

  it("audit-logs a failed api-key auth attempt with prefix only", async () => {
    const { raw } = generateApiKey();
    await request(makePingApp()).get("/ping").set("x-api-key", raw);
    // persist() is fire-and-forget; give it a beat to land. Query by THIS
    // key's prefix — earlier 401 tests in this file leak their own
    // API_KEY_AUTH_FAILED events, so an unfiltered findOne is racy.
    await new Promise((r) => setTimeout(r, 80));
    const prefix = raw.slice(0, 8);
    const ev = await AuditLog.findOne({
      eventType: "API_KEY_AUTH_FAILED",
      "data.prefix": prefix,
    }).lean();
    expect(ev).toBeTruthy();
    expect(ev?.success).toBe(false);
    expect(ev?.data).toMatchObject({ reason: "invalid-or-revoked" });
    expect(JSON.stringify(ev)).not.toContain(raw);
    expect(JSON.stringify(ev)).toContain(prefix);
  });

  it("rejects revoked key with 401", async () => {
    const user = await User.create({
      email: "c@b.co",
      passwordHash: validHash,
      firstName: "C",
      lastName: "B",
      emailVerified: true,
    });
    const { raw, hash, prefix } = generateApiKey();
    await ApiKey.create({
      userId: user._id,
      name: "revoked",
      keyHash: hash,
      prefix,
      revokedAt: new Date(),
    });
    const r = await request(makePingApp()).get("/ping").set("x-api-key", raw);
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("AUTH_INVALID_API_KEY");
  });

  it("bumps lastUsedAt on successful auth", async () => {
    const user = await User.create({
      email: "d@b.co",
      passwordHash: validHash,
      firstName: "D",
      lastName: "B",
      emailVerified: true,
    });
    const { raw, hash, prefix } = generateApiKey();
    const doc = await ApiKey.create({
      userId: user._id,
      name: "use",
      keyHash: hash,
      prefix,
    });
    expect(doc.lastUsedAt).toBeUndefined();
    await request(makePingApp()).get("/ping").set("x-api-key", raw);
    // Fire-and-forget: give the async update a beat to land
    await new Promise((r) => setTimeout(r, 50));
    const found = await ApiKey.findById(doc._id).lean();
    expect(found?.lastUsedAt).toBeInstanceOf(Date);
  });
});

/**
 * Controller tests use a minimal Express app with a `stubUser` middleware
 * that injects req.user directly. This exercises the controller handlers
 * without running the full JWT stack.
 */
function makeKeyApp(userId: string) {
  const app = express();
  app.use(express.json());
  const stubUser = (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    _req.user = { userId, email: "stub@x.co" };
    next();
  };
  app.post("/keys", stubUser, issueApiKey);
  app.get("/keys", stubUser, listApiKeys);
  app.patch("/keys/:id/revoke", stubUser, revokeApiKey);
  return app;
}

describe("apikey controller", () => {
  let userId: string;

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) await connectTestDb();
  });

  beforeEach(async () => {
    const u = await User.create({
      email: `owner-${Date.now()}@x.co`,
      passwordHash: validHash,
      firstName: "Owner",
      lastName: "T",
      emailVerified: true,
    });
    userId = String(u._id);
    await AuditLog.deleteMany({});
  });

  it("writes audit records for issue and revoke without raw key material", async () => {
    const issued = await request(makeKeyApp(userId))
      .post("/keys")
      .send({ name: "audit-me" });
    expect(issued.status).toBe(201);
    const rawKey = issued.body.data.key as string;
    const keyId = issued.body.data.id as string;

    const rev = await request(makeKeyApp(userId)).patch(
      `/keys/${keyId}/revoke`,
    );
    expect(rev.status).toBe(200);

    await new Promise((r) => setTimeout(r, 80));
    const events = await AuditLog.find({}).lean();
    const types = events.map((e) => e.eventType);
    expect(types).toContain("API_KEY_ISSUED");
    expect(types).toContain("API_KEY_REVOKED");
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(rawKey);
    expect(serialized).toContain(rawKey.slice(0, 8));
  });

  it("POST /keys issues a raw key with jtk_ prefix", async () => {
    const r = await request(makeKeyApp(userId))
      .post("/keys")
      .send({ name: "laptop" });
    expect(r.status).toBe(201);
    expect(r.body.data.key).toMatch(/^jtk_[a-f0-9]{40}$/);
    expect(r.body.data.name).toBe("laptop");
    expect(r.body.data.prefix).toBe(r.body.data.key.slice(0, 8));
  });

  it("GET /keys returns list without ever exposing the raw or hash", async () => {
    const a = await request(makeKeyApp(userId))
      .post("/keys")
      .send({ name: "k1" });
    const b = await request(makeKeyApp(userId))
      .post("/keys")
      .send({ name: "k2" });
    const r = await request(makeKeyApp(userId)).get("/keys");
    expect(r.status).toBe(200);
    expect(r.body.data.keys).toHaveLength(2);
    const json = JSON.stringify(r.body);
    // The 8-char prefix ("jtk_xxx") IS intentionally shown so users can
    // recognise their keys. The full raw value (44 chars) must never appear.
    expect(json).not.toContain(a.body.data.key);
    expect(json).not.toContain(b.body.data.key);
    expect(json).not.toMatch(/keyHash/);
  });

  it("PATCH /keys/:id/revoke sets revokedAt and makes auth calls fail", async () => {
    const issued = await request(makeKeyApp(userId))
      .post("/keys")
      .send({ name: "revoke-me" });
    const id = issued.body.data.id;
    const rawKey = issued.body.data.key;

    // Confirm auth works with the raw key before revocation
    const ping1 = await request(makePingApp())
      .get("/ping")
      .set("x-api-key", rawKey);
    expect(ping1.status).toBe(200);

    const rev = await request(makeKeyApp(userId)).patch(`/keys/${id}/revoke`);
    expect(rev.status).toBe(200);
    expect(rev.body.data.revokedAt).toBeTruthy();

    const ping2 = await request(makePingApp())
      .get("/ping")
      .set("x-api-key", rawKey);
    expect(ping2.status).toBe(401);
  });

  it("rejects empty key name with 400", async () => {
    const r = await request(makeKeyApp(userId))
      .post("/keys")
      .send({ name: "" });
    expect(r.status).toBe(400);
  });
});

describe("api-key revocation on credential change (H2)", () => {
  beforeAll(async () => {
    // Same shared-connection pattern as the controller describe above.
    if (mongoose.connection.readyState !== 1) await connectTestDb();
  });
  beforeEach(async () => {
    await ApiKey.deleteMany({});
    await User.deleteMany({});
  });

  async function userWithLiveKey(email: string, password: string) {
    const user = await User.create({
      email,
      passwordHash: bcrypt.hashSync(password, 10),
      firstName: "Rev",
      lastName: "Oked",
      emailVerified: true,
    });
    const { raw, hash, prefix } = generateApiKey();
    await ApiKey.create({
      userId: user._id,
      name: "live-key",
      keyHash: hash,
      prefix,
    });
    return { user, raw };
  }

  it("changePassword revokes every live api key for the account", async () => {
    const { user, raw } = await userWithLiveKey(
      "chgpw@b.co",
      "old-password-123",
    );
    const ok = await request(makePingApp()).get("/ping").set("x-api-key", raw);
    expect(ok.status).toBe(200);

    await changePassword(
      String(user._id),
      "old-password-123",
      "new-password-456",
      "127.0.0.1",
    );

    const gone = await request(makePingApp())
      .get("/ping")
      .set("x-api-key", raw);
    expect(gone.status).toBe(401);
    const doc = await ApiKey.findOne({}).lean();
    expect(doc?.revokedAt).toBeTruthy();
  });

  it("resetPassword revokes every live api key for the account", async () => {
    const { user, raw } = await userWithLiveKey(
      "respw@b.co",
      "pw-before-reset",
    );
    const token = "reset-token-value-xyz";
    await User.findByIdAndUpdate(user._id, {
      resetPasswordToken: crypto
        .createHash("sha256")
        .update(token)
        .digest("hex"),
      resetPasswordExpires: new Date(Date.now() + 10 * 60 * 1000),
    });

    await resetPassword(token, "pw-after-reset", "127.0.0.1");

    const gone = await request(makePingApp())
      .get("/ping")
      .set("x-api-key", raw);
    expect(gone.status).toBe(401);
  });
});
