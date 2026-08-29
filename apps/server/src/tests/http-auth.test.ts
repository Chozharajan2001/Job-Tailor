import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../app.js";
import * as authService from "../services/auth.service.js";
import { Resume } from "../models/Resume.model.js";
import { User } from "../models/User.model.js";
import { connectTestDb, disconnectTestDb } from "./helpers/test-db.js";

/**
 * HTTP-level tests: middleware guards, auth flow over real routes,
 * and the mass-assignment regression for resume updates.
 */

process.env.NODE_ENV = "test";

const email = "http-test@example.com";
const password = "SecurePassword123!";
let accessToken = "";
let userId = "";

beforeAll(async () => {
  await connectTestDb();

  // Provision a verified user through the service layer
  const registered = await authService.registerUser({
    email,
    password,
    firstName: "Http",
    lastName: "Test",
  });
  await authService.verifyEmail(registered.verificationToken);

  const login = await authService.loginUser(
    email,
    password,
    "http-agent",
    "127.0.0.1",
  );
  accessToken = login.accessToken;
  userId = login.user._id;
});

afterAll(async () => {
  await disconnectTestDb();
});

describe("Auth guards", () => {
  it("GET /auth/me requires a token (401 without)", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_MISSING_TOKEN");
  });

  it("GET /auth/me returns the user with a valid token", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(email);
    // Sensitive fields must never leak
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.user.activeSessions).toBeUndefined();
  });

  it("rejects a malformed token (401)", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer not-a-jwt");
    expect(res.status).toBe(401);
  });
});

describe("RBAC", () => {
  it("non-admin gets 403 on POST /search/cleanup", async () => {
    const res = await request(app)
      .post("/api/v1/search/cleanup")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ thresholdDays: 30 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("non-admin gets 403 on POST /search/sources", async () => {
    const res = await request(app)
      .post("/api/v1/search/sources")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "x",
        sourceType: "manual_paste",
        baseUrl: "local://x",
        extractionStrategy: "manual_input",
      });
    expect(res.status).toBe(403);
  });

  it("non-admin gets 403 on GET /search/analytics/dashboard", async () => {
    const res = await request(app)
      .get("/api/v1/search/analytics/dashboard")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });
});

describe("Login response contract", () => {
  it("returns the refresh token ONLY as an HttpOnly cookie, never in the body", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    // Critical security contract: no refresh token in the JSON body
    expect(res.body.data.refreshToken).toBeUndefined();

    const setCookie = res.headers["set-cookie"] as unknown as string[];
    const cookie = Array.isArray(setCookie)
      ? setCookie.join("; ")
      : String(setCookie || "");
    expect(cookie).toContain("refreshToken=");
    expect(cookie.toLowerCase()).toContain("httponly");
  });
});

describe("Mass assignment protection (PUT /resumes/:id)", () => {
  it("cannot overwrite ownership/control fields via the update body", async () => {
    const resume = await Resume.create({
      userId,
      version: 1,
      versionLabel: "mass-assignment-test",
      tailoredSummary: "original",
      skills: [],
      experience: [],
      projects: [],
      sectionOrder: ["summary"],
      status: "draft",
    });

    const attackerId = "64b000000000000000000000";
    const res = await request(app)
      .put(`/api/v1/resumes/${resume._id.toString()}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        tailoredSummary: "updated summary",
        // Hostile fields — must be stripped by validation
        userId: attackerId,
        isProfileResume: true,
        version: 999,
        status: "approved",
      });

    expect(res.status).toBe(200);

    const fresh = await Resume.findById(resume._id).lean();
    expect(fresh!.tailoredSummary).toBe("updated summary"); // allowed field applied
    expect(fresh!.userId!.toString()).toBe(userId); // ownership untouched
    expect(fresh!.isProfileResume).toBeFalsy(); // control field untouched
    expect(fresh!.version).toBe(1);
    expect(fresh!.status).toBe("draft");
  });

  it("cannot update another user's resume (404)", async () => {
    const other = await User.create({
      email: "victim@example.com",
      passwordHash:
        "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345",
      firstName: "Vic",
      lastName: "Tim",
    });
    const victimResume = await Resume.create({
      userId: other._id,
      version: 1,
      versionLabel: "victim-resume",
      skills: [],
      experience: [],
      projects: [],
      sectionOrder: ["summary"],
      status: "draft",
    });

    const res = await request(app)
      .put(`/api/v1/resumes/${victimResume._id.toString()}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ tailoredSummary: "stolen" });

    expect(res.status).toBe(404);
  });
});
