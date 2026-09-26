import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { generateApiKey, hashApiKey } from "../utils/api-key.js";
import { ApiKey } from "../models/ApiKey.model.js";
import { User } from "../models/User.model.js";
import { authenticateByApiKey } from "../middleware/api-key-auth.js";
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
