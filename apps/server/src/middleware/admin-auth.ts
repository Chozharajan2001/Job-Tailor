import { Request, Response, NextFunction } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { config } from "../config/index.js";

/**
 * Gates the /api/v1/admin/* routes used by the external job-source poller.
 * Returns 503 when SOURCE_POLL_ADMIN_KEY is unset (endpoint not configured)
 * and 401 when the caller's x-admin-key header does not match.
 */

/**
 * Digest both sides first so the comparison is over fixed-length values:
 * a direct Buffer.compare of unequal-length secrets would return early on the
 * length, and a plain `!==` leaks the position of the first differing byte.
 */
function keyMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export function requireAdminKey(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const expected = config.sourcePollAdminKey;
  if (!expected) {
    res.status(503).json({
      success: false,
      error: {
        code: "ADMIN_NOT_CONFIGURED",
        message: "SOURCE_POLL_ADMIN_KEY is not set on this server",
      },
    });
    return;
  }
  const provided = req.header("x-admin-key") ?? "";
  if (!provided || !keyMatches(provided, expected)) {
    res.status(401).json({
      success: false,
      error: {
        code: "UNAUTHORIZED_ADMIN",
        message: "Missing or bad x-admin-key",
      },
    });
    return;
  }
  next();
}
