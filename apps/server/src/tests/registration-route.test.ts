import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import request from "supertest";
import { User } from "../models/User.model.js";
import { connectTestDb, disconnectTestDb } from "./helpers/test-db.js";

process.env.NODE_ENV = "test";

const { default: app } = await import("../app.js");

const PASSWORD = "Passw0rd!2026";

const register = (email: string) =>
  request(app).post("/api/v1/auth/register").send({
    email,
    password: PASSWORD,
    firstName: "Test",
    lastName: "User",
  });

describe("POST /api/v1/auth/register — H7 gate", () => {
  beforeAll(async () => {
    await connectTestDb();
  });
  afterAll(async () => {
    await disconnectTestDb();
  });
  beforeEach(async () => {
    await User.deleteMany({});
  });
  afterEach(() => {
    delete process.env.REGISTRATION_MODE;
    delete process.env.REGISTRATION_EMAIL_ALLOWLIST;
  });

  it("leaves registration open when no mode is configured", async () => {
    const res = await register("someone@example.com");
    expect(res.status).toBe(201);
    expect(await User.countDocuments({ email: "someone@example.com" })).toBe(1);
  });

  it("refuses an unlisted address without creating a user", async () => {
    process.env.REGISTRATION_MODE = "allowlist";
    process.env.REGISTRATION_EMAIL_ALLOWLIST = "founder@acme.co";

    const res = await register("stranger@gmail.com");

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("EMAIL_NOT_ALLOWED");
    expect(await User.countDocuments({})).toBe(0);
  });

  it("accepts a listed address under allowlist mode", async () => {
    process.env.REGISTRATION_MODE = "allowlist";
    process.env.REGISTRATION_EMAIL_ALLOWLIST = "Founder@Acme.co";

    const res = await register("founder@acme.co");

    expect(res.status).toBe(201);
    expect(await User.countDocuments({ email: "founder@acme.co" })).toBe(1);
  });

  it("refuses every address when registration is closed", async () => {
    process.env.REGISTRATION_MODE = "closed";

    const res = await register("founder@acme.co");

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("REGISTRATION_CLOSED");
    expect(await User.countDocuments({})).toBe(0);
  });
});
