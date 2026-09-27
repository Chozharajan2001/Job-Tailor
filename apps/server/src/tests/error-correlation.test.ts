import { describe, it, expect, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { pinoHttp } from "pino-http";
import { randomUUID } from "crypto";
import { errorHandler, ApiError } from "../middleware/error-handler.js";
import { logger } from "../utils/logger.js";

process.env.NODE_ENV = "test";

/**
 * Mirrors the pino-http wiring in app.ts (same genReqId contract) so the
 * correlation assertion covers the production shape: the id set on the
 * response header must equal the requestId in the error log meta.
 */
function makeApp() {
  const app = express();
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = (req.headers["x-request-id"] as string) || randomUUID();
        res.setHeader("X-Request-Id", id);
        return id;
      },
      autoLogging: false,
    }),
  );
  app.get("/boom", () => {
    throw new ApiError(400, "TEST_BOOM", "boom");
  });
  app.use(errorHandler);
  return app;
}

function spyWarn() {
  return vi
    .spyOn(logger, "warn")
    .mockImplementation((() => undefined) as unknown as typeof logger.warn);
}

describe("error handler request correlation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs the same request id it returns in X-Request-Id", async () => {
    const warn = spyWarn();
    const res = await request(makeApp()).get("/boom");
    expect(res.status).toBe(400);
    const headerId = res.headers["x-request-id"];
    expect(headerId).toBeTruthy();
    expect(warn).toHaveBeenCalled();
    const meta = warn.mock.calls[0][0] as { requestId?: string };
    expect(meta.requestId).toBe(headerId);
  });

  it("preserves an inbound x-request-id end to end", async () => {
    const warn = spyWarn();
    const res = await request(makeApp())
      .get("/boom")
      .set("x-request-id", "trace-abc-123");
    expect(res.headers["x-request-id"]).toBe("trace-abc-123");
    const meta = warn.mock.calls[0][0] as { requestId?: string };
    expect(meta.requestId).toBe("trace-abc-123");
  });
});
