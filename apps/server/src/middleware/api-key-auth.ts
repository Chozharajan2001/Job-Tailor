import { Request, Response, NextFunction } from "express";
import { ApiKey } from "../models/ApiKey.model.js";
import { User } from "../models/User.model.js";
import { hashApiKey } from "../utils/api-key.js";

/**
 * Authenticates a request carrying `x-api-key: jtk_...` (the long-lived
 * per-user key issued from the web UI's /apikeys page, used by the browser
 * extension). On success, populates `req.user` with the same shape the
 * JWT `authenticate` middleware sets, so downstream controllers don't
 * care which auth path was used.
 *
 * Only the SHA-256 hash of the raw key is stored; the raw value is never
 * logged, cached, or persisted anywhere.
 *
 * `lastUsedAt` is bumped on every successful authenticate — fire-and-forget,
 * never allowed to break the request path.
 */
export async function authenticateByApiKey(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const raw = req.header("x-api-key");
  if (!raw) {
    res.status(401).json({
      success: false,
      error: {
        code: "AUTH_MISSING_API_KEY",
        message: "x-api-key header required",
      },
    });
    return;
  }

  const keyHash = hashApiKey(raw);
  const key = await ApiKey.findOne({ keyHash, revokedAt: null });
  if (!key) {
    res.status(401).json({
      success: false,
      error: {
        code: "AUTH_INVALID_API_KEY",
        message: "Unknown or revoked key",
      },
    });
    return;
  }

  const user = await User.findById(key.userId).lean();
  if (!user) {
    res.status(401).json({
      success: false,
      error: { code: "AUTH_USER_NOT_FOUND", message: "Key owner missing" },
    });
    return;
  }

  req.user = { userId: String(user._id), email: user.email };
  ApiKey.updateOne(
    { _id: key._id },
    { $set: { lastUsedAt: new Date() } },
  ).catch(() => {
    /* audit only */
  });
  next();
}
