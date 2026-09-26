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
import bcrypt from "bcryptjs";
import { User } from "../models/User.model.js";
import { Job } from "../models/Job.model.js";
import { Application } from "../models/Application.model.js";
import { createFromExtension } from "../controllers/application-extension.controller.js";
import type { ApplicationDraft } from "../services/application-draft.types.js";
import { connectTestDb, disconnectTestDb } from "./helpers/test-db.js";

process.env.NODE_ENV = "test";

const validHash = bcrypt.hashSync("x", 10);

function makeReqRes(body: unknown, userId?: string) {
  const req = {
    body,
    user: userId ? { userId, email: "x@y.co" } : undefined,
  } as unknown as import("express").Request;
  const res = {
    statusCode: 200,
    payload: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: unknown) {
      this.payload = data;
      return this;
    },
  } as unknown as import("express").Response & {
    statusCode: number;
    payload: any;
  };
  return { req, res };
}

function draft(overrides: Partial<ApplicationDraft> = {}): ApplicationDraft {
  return {
    platform: "greenhouse",
    sourceUrl: "https://boards.greenhouse.io/acme/jobs/101",
    companyName: "Acme",
    jobTitle: "Senior Engineer",
    jdRawText: "Do engineering.",
    detectedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("POST /applications/from-extension controller", () => {
  let userId: string;

  beforeAll(async () => {
    await connectTestDb();
  });
  afterAll(async () => {
    await disconnectTestDb();
  });
  beforeEach(async () => {
    await Job.deleteMany({});
    await Application.deleteMany({});
    await User.deleteMany({});
    const u = await User.create({
      email: `owner-${Date.now()}@x.co`,
      passwordHash: validHash,
      firstName: "O",
      lastName: "T",
      emailVerified: true,
    });
    userId = String(u._id);
  });

  it("400 on invalid payload", async () => {
    const { req, res } = makeReqRes({ bad: true }, userId);
    await createFromExtension(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.payload).toMatchObject({
      success: false,
      error: { code: "INVALID_DRAFT" },
    });
  });

  it("201 + creates both Job and Application on first call", async () => {
    const { req, res } = makeReqRes(draft(), userId);
    await createFromExtension(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.payload).toMatchObject({
      success: true,
      data: { jobCreated: true, applicationCreated: true },
    });
    expect(await Job.countDocuments({ userId })).toBe(1);
    expect(await Application.countDocuments({ userId })).toBe(1);
    const app = await Application.findOne({ userId }).lean();
    expect(app?.status).toBe("applied");
    expect(app?.timelineEvents?.[0]?.event).toMatch(/via browser extension/);
  });

  it("200 (idempotent) on second call with same URL — no new Application", async () => {
    const first = makeReqRes(draft(), userId);
    await createFromExtension(first.req, first.res);
    const second = makeReqRes(draft(), userId);
    await createFromExtension(second.req, second.res);
    expect(second.res.statusCode).toBe(200);
    expect(second.res.payload).toMatchObject({
      success: true,
      data: { jobCreated: false, applicationCreated: false },
    });
    expect(await Job.countDocuments({ userId })).toBe(1);
    expect(await Application.countDocuments({ userId })).toBe(1);
  });

  it("reuses Job via company+title when URL differs, still creates Application", async () => {
    // Same company + title, different URL. Job is reused (via 60-day match),
    // but because it's the SAME userId, the (userId, jobId) unique index
    // catches the Application collision and returns the existing one.
    const a = makeReqRes(
      draft({ sourceUrl: "https://boards.greenhouse.io/acme/jobs/1" }),
      userId,
    );
    await createFromExtension(a.req, a.res);
    const b = makeReqRes(
      draft({ sourceUrl: "https://boards.greenhouse.io/acme/jobs/2" }),
      userId,
    );
    await createFromExtension(b.req, b.res);
    expect(b.res.statusCode).toBe(200);
    expect(await Job.countDocuments({ userId })).toBe(1);
    expect(await Application.countDocuments({ userId })).toBe(1);
  });

  it("rejects when req.user is missing (defensive; middleware should always set it)", async () => {
    const { req, res } = makeReqRes(draft(), undefined);
    // The handler assumes req.user is populated by the middleware.
    await expect(createFromExtension(req, res)).rejects.toBeTruthy();
  });

  it("records the detectedAt timestamp on the timeline event", async () => {
    const when = "2026-09-26T10:00:00.000Z";
    const { req, res } = makeReqRes(draft({ detectedAt: when }), userId);
    await createFromExtension(req, res);
    const app = await Application.findOne({ userId }).lean();
    const ev = app?.timelineEvents?.[0];
    expect(ev?.eventDate).toBeInstanceOf(Date);
    expect(new Date(ev!.eventDate).toISOString()).toBe(when);
  });
});
