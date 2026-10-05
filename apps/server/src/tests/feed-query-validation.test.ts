import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../app.js";
import * as authService from "../services/auth.service.js";
import { User } from "../models/User.model.js";
import { connectTestDb, disconnectTestDb } from "./helpers/test-db.js";

/**
 * M5: GET /api/v1/search/feed is the only list route that reads `page` and
 * `limit` straight through `parseInt(...) || default` (feed.controller.ts:9-10)
 * with no schema, while the four comparable routes all pass through
 * validateQuery. Two consequences: an arbitrarily large `limit` is honoured,
 * and garbage input is silently reinterpreted instead of rejected — so a
 * client sending `?page=abc` gets page 1 and never learns its own bug.
 *
 * Note what this is NOT: feed.service.ts:170-171 paginates with an
 * in-memory slice over an already-scored candidate set, so `limit` never
 * reaches the database. The bound protects response size, not query cost.
 */

process.env.NODE_ENV = "test";

let accessToken = "";

beforeAll(async () => {
  await connectTestDb();

  const registered = await authService.registerUser({
    email: "feed-query@example.com",
    password: "SecurePassword123!",
    firstName: "Feed",
    lastName: "Query",
  });
  await authService.verifyEmail(registered.verificationToken);
  const login = await authService.loginUser(
    "feed-query@example.com",
    "SecurePassword123!",
    "feed-query-agent",
    "127.0.0.1",
  );
  accessToken = login.accessToken;
});

afterAll(async () => {
  await User.deleteMany({ email: "feed-query@example.com" });
  await disconnectTestDb();
});

function feed(query: string) {
  return request(app)
    .get(`/api/v1/search/feed${query}`)
    .set("Authorization", `Bearer ${accessToken}`);
}

describe("M5 /search/feed rejects malformed pagination instead of reinterpreting it", () => {
  it.each([
    ["limit above the cap", "?limit=1000000", "limit"],
    ["limit zero", "?limit=0", "limit"],
    ["limit negative", "?limit=-5", "limit"],
    ["limit not a number", "?limit=abc", "limit"],
    ["page zero", "?page=0", "page"],
    ["page negative", "?page=-2", "page"],
    ["page not a number", "?page=abc", "page"],
    ["page fractional", "?page=1.5", "page"],
  ])("%s -> 400 VALIDATION_ERROR on %s", async (_name, query, field) => {
    const res = await feed(query);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(
      res.body.error.details.map((d: { field: string }) => d.field),
    ).toContain(field);
  });

  it("answers inside the bounds, with the documented defaults", async () => {
    const res = await feed("");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.pagination.page).toBe(1);
    expect(res.body.data.pagination.limit).toBe(20);
  });

  it("still serves the page size the client actually asks for", async () => {
    const res = await feed("?page=2&limit=15");
    expect(res.status).toBe(200);
    expect(res.body.data.pagination.page).toBe(2);
    expect(res.body.data.pagination.limit).toBe(15);
  });

  it("accepts the cap boundary itself", async () => {
    const res = await feed("?limit=100");
    expect(res.status).toBe(200);
    expect(res.body.data.pagination.limit).toBe(100);
  });

  it("does not let an out-of-range page leak a slice from the end", async () => {
    const res = await feed("?page=999999&limit=20");
    expect(res.status).toBe(200);
    expect(res.body.data.feed).toEqual([]);
  });
});
