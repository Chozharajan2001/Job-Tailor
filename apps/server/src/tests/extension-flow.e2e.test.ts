import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User.model.js";
import { ApiKey } from "../models/ApiKey.model.js";
import { Job } from "../models/Job.model.js";
import { Application } from "../models/Application.model.js";
import { authenticateByApiKey } from "../middleware/api-key-auth.js";
import { issueApiKey } from "../controllers/apikey.controller.js";
import { createFromExtension } from "../controllers/application-extension.controller.js";
import { connectTestDb, disconnectTestDb } from "./helpers/test-db.js";

process.env.NODE_ENV = "test";

const validHash = bcrypt.hashSync("e2e-password", 10);

/**
 * End-to-end of the extension's server journey, with no browser involved:
 * issue a key via the controller -> call the extension endpoint with it ->
 * verify Job + Application land -> re-poll is idempotent -> revoke kills it.
 * The browser side (detector -> popup -> background fetch) is verified by
 * loading dist/ in Chrome manually; everything past the fetch is here.
 */

function stubReq(body: unknown, userId?: string) {
  return {
    body,
    user: userId ? { userId, email: "x@y.co" } : undefined,
  } as unknown as import("express").Request;
}

function stubRes() {
  return {
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
}

function extensionApp() {
  const app = express();
  app.use(express.json());
  app.post("/from-extension", authenticateByApiKey, createFromExtension);
  return app;
}

describe("extension flow e2e (server half)", () => {
  let userId: string;
  let rawKey: string;

  const draft = {
    platform: "greenhouse",
    sourceUrl: "https://boards.greenhouse.io/stripe/jobs/777",
    companyName: "Stripe",
    jobTitle: "Senior Software Engineer",
    jdRawText: "Build payment infrastructure. Ruby, distributed systems.",
    detectedAt: new Date().toISOString(),
  };

  beforeAll(async () => {
    await connectTestDb();
  });
  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await Job.deleteMany({});
    await Application.deleteMany({});
    await ApiKey.deleteMany({});
    await User.deleteMany({});
    const user = await User.create({
      email: "e2e@x.co",
      passwordHash: validHash,
      firstName: "E2E",
      lastName: "T",
      emailVerified: true,
    });
    userId = String(user._id);

    // Issue a real key through the real controller (JWT is stubbed at this
    // layer; the JWT path itself is covered in apikey.test.ts).
    const req = stubReq({ name: "e2e-extension" }, userId);
    const res = stubRes();
    await issueApiKey(req, res);
    expect(res.statusCode).toBe(201);
    rawKey = (res.payload as { data: { key: string } }).data.key;
    expect(rawKey).toMatch(/^jtk_/);
  });

  it("full journey: key -> detect-draft -> job + application -> idempotent -> revoke", async () => {
    const app = extensionApp();

    // 1. First submission creates everything.
    const first = await request(app)
      .post("/from-extension")
      .set("x-api-key", rawKey)
      .send(draft);
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({
      jobCreated: true,
      applicationCreated: true,
    });

    // 2. The Kanban board would now show this application: verify the row.
    const application = await Application.findOne({ userId }).lean();
    expect(application?.status).toBe("applied");
    expect(application?.timelineEvents[0]?.event).toMatch(/browser extension/);
    const job = await Job.findById(application?.jobId).lean();
    expect(job?.jobTitle).toBe("Senior Software Engineer");
    expect(job?.companyName).toBe("Stripe");
    expect(job?.jobLink).toBe(draft.sourceUrl);

    // 3. Extension re-fires on a page refresh: idempotent, no duplicates.
    const second = await request(app)
      .post("/from-extension")
      .set("x-api-key", rawKey)
      .send(draft);
    expect(second.status).toBe(200);
    expect(second.body.data.applicationCreated).toBe(false);
    expect(await Application.countDocuments({ userId })).toBe(1);

    // 4. User revokes the key in JobTailor: extension access dies instantly.
    await ApiKey.updateMany({}, { $set: { revokedAt: new Date() } });
    const third = await request(app)
      .post("/from-extension")
      .set("x-api-key", rawKey)
      .send({
        ...draft,
        sourceUrl: "https://boards.greenhouse.io/stripe/jobs/778",
      });
    expect(third.status).toBe(401);
    expect(await Job.countDocuments({ userId })).toBe(1); // nothing new created
  });
});
