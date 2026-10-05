import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { requireAdminKey } from "../middleware/admin-auth.js";
import { config, validateConfig } from "../config/index.js";

process.env.NODE_ENV = "test";

/**
 * M3: the admin shared secret was compared with a plain `!==`, had no length
 * policy, and sat behind no request limit, so an unbounded brute-force over the
 * network was possible and the comparison shape was observable.
 *
 * Two of the three properties below have no behavioural oracle — a constant-time
 * compare and an unused-key length rule look identical to the broken version
 * from the outside for every input we can assert on — so they are pinned as
 * source invariants with an explicit note, while the limiter is tested for real
 * through the HTTP stack.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const middlewareSource = fs.readFileSync(
  path.join(here, "..", "middleware", "admin-auth.ts"),
  "utf8",
);

function fakeReq(header?: string) {
  return {
    header: (name: string) => (name === "x-admin-key" ? header : undefined),
  } as any;
}

function capture() {
  const out: { status: number; body: any } = { status: 200, body: null };
  const res = {
    status: (code: number) => {
      out.status = code;
      return res;
    },
    json: (body: any) => {
      out.body = body;
      return res;
    },
  } as any;
  return { out, res };
}

const GOOD = "0123456789abcdef0123456789abcdef";

describe("M3 admin key comparison is constant-time", () => {
  it("uses timingSafeEqual and never a bare equality on the secret", () => {
    expect(middlewareSource).toMatch(/timingSafeEqual/);
    expect(middlewareSource).toMatch(/node:crypto|["']crypto["']/);
    expect(middlewareSource).not.toMatch(/provided\s*[!=]==?\s*expected/);
    expect(middlewareSource).not.toMatch(/expected\s*[!=]==?\s*provided/);
  });

  it("accepts the exact key and rejects near-misses of both shapes", () => {
    const previous = config.sourcePollAdminKey;
    config.sourcePollAdminKey = GOOD;
    try {
      const cases: Array<[string | undefined, number]> = [
        [GOOD, 200],
        [GOOD.slice(0, -1), 401],
        [GOOD + "0", 401],
        [GOOD.toUpperCase(), 401],
        ["", 401],
        [undefined, 401],
      ];
      for (const [header, expected] of cases) {
        const { out, res } = capture();
        let called = false;
        requireAdminKey(fakeReq(header), res, () => {
          called = true;
        });
        if (expected === 200) {
          expect(called).toBe(true);
        } else {
          expect(out.status).toBe(401);
          expect(out.body.error.code).toBe("UNAUTHORIZED_ADMIN");
        }
      }
    } finally {
      config.sourcePollAdminKey = previous;
    }
  });

  it("keeps the 503 ADMIN_NOT_CONFIGURED path when the key is unset", () => {
    const previous = config.sourcePollAdminKey;
    config.sourcePollAdminKey = "";
    try {
      const { out, res } = capture();
      requireAdminKey(fakeReq(GOOD), res, () => undefined);
      expect(out.status).toBe(503);
      expect(out.body.error.code).toBe("ADMIN_NOT_CONFIGURED");
    } finally {
      config.sourcePollAdminKey = previous;
    }
  });
});

describe("M3 admin key length policy", () => {
  const original = process.env.JWT_SECRET;

  afterEach(() => {
    process.env.JWT_SECRET = original;
  });

  it("rejects a short configured key at boot", () => {
    const previous = config.sourcePollAdminKey;
    config.sourcePollAdminKey = "too-short";
    try {
      expect(() => validateConfig()).toThrow(/SOURCE_POLL_ADMIN_KEY/);
    } finally {
      config.sourcePollAdminKey = previous;
    }
  });

  it("still boots with no key at all, because the routes answer 503", () => {
    const previous = config.sourcePollAdminKey;
    config.sourcePollAdminKey = "";
    try {
      expect(() => validateConfig()).not.toThrow(/SOURCE_POLL_ADMIN_KEY/);
    } finally {
      config.sourcePollAdminKey = previous;
    }
  });

  it("boots with a key of the required length", () => {
    const previous = config.sourcePollAdminKey;
    config.sourcePollAdminKey = GOOD;
    try {
      expect(() => validateConfig()).not.toThrow(/SOURCE_POLL_ADMIN_KEY/);
    } finally {
      config.sourcePollAdminKey = previous;
    }
  });
});

describe("M3 admin route limiter", () => {
  let app: any;

  beforeAll(async () => {
    // requireAdminKey reads the value per request, so configuring it here is
    // enough — no need to re-import the app with a different environment.
    config.sourcePollAdminKey = GOOD;
    const mod = await import("../app.js");
    app = mod.default;
  });

  afterAll(() => {
    config.sourcePollAdminKey = "";
  });

  it("limits repeated bad admin key attempts", async () => {
    const { default: request } = await import("supertest");

    const statuses: number[] = [];
    for (let i = 0; i < 15; i += 1) {
      const res = await request(app)
        .post("/api/v1/admin/poll-due-sources")
        .set("x-admin-key", `wrong-key-attempt-${i}`);
      statuses.push(res.status);
      if (res.status === 429) {
        expect(res.body.error.code).toBe("ADMIN_RATE_LIMITED");
        break;
      }
    }

    expect(statuses).toContain(429);
  });
});
