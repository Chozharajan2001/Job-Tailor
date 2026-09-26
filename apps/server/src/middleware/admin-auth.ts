import { Request, Response, NextFunction } from "express";
import { config } from "../config/index.js";

/**
 * Gates the /api/v1/admin/* routes used by the external job-source poller.
 * Returns 503 when SOURCE_POLL_ADMIN_KEY is unset (endpoint not configured)
 * and 401 when the caller's x-admin-key header does not match.
 *
 * A plain string compare is fine here: the value is a long random token from
 * env, not a user password, and Node's !== on equal-length hex/base64 strings
 * is not a practical timing oracle in this code path.
 */
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
  const provided = req.header("x-admin-key");
  if (!provided || provided !== expected) {
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
