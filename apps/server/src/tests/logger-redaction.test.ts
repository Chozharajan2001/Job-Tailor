import { describe, it, expect } from "vitest";
import { Writable } from "node:stream";
import pino from "pino";
import { REDACT_PATHS } from "../utils/logger.js";

process.env.NODE_ENV = "test";

/**
 * Behavior test for the redaction config (finding H1, 2026-09-27):
 * pino-http's default serializer copies the full header object onto every
 * request line, so an unredacted x-api-key / x-admin-key would persist
 * long-lived bearer secrets in logs. We construct a throwaway pino with the
 * SAME exported paths against an in-memory sink — deterministic, no stdout
 * capture, no transport workers.
 */
function captureSink() {
  const chunks: string[] = [];
  const sink = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(String(chunk));
      cb();
    },
  });
  return { sink, out: () => chunks.join("") };
}

describe("logger redaction (H1)", () => {
  it("redacts x-api-key and x-admin-key from serialized request headers", () => {
    const { sink, out } = captureSink();
    const log = pino(
      { redact: { paths: REDACT_PATHS, censor: "[REDACTED]" }, level: "info" },
      sink,
    );
    const rawKey = `jtk_${"a".repeat(40)}`;
    const adminKey = "super-admin-secret-value-0123456789abcdef";

    log.info(
      {
        req: {
          method: "POST",
          url: "/api/v1/applications/from-extension",
          headers: {
            "x-api-key": rawKey,
            "x-admin-key": adminKey,
            authorization: "Bearer accesstoken.value",
            cookie: "refresh=secret",
            "user-agent": "Mozilla/5.0",
          },
        },
      },
      "request completed",
    );

    const line = out();
    expect(line).not.toContain(rawKey);
    expect(line).not.toContain(adminKey);
    expect(line).not.toContain("accesstoken.value");
    // Non-sensitive headers still flow through — redaction is targeted, not blanket.
    expect(line).toContain("Mozilla/5.0");
    expect(line.match(/\[REDACTED\]/g)!.length).toBeGreaterThanOrEqual(4);
  });
});
