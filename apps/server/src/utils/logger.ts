import pino from "pino";
import { config } from "../config/index.js";

/**
 * Structured application logger (pino).
 * - JSON output in production for log aggregation
 * - Pretty output in development
 * - Sensitive fields are redacted
 */
export const logger = pino({
  level:
    process.env.LOG_LEVEL ||
    (config.nodeEnv === "production" ? "info" : "debug"),
  ...(config.nodeEnv !== "production"
    ? { transport: { target: "pino-pretty", options: { colorize: true } } }
    : {}),
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.body.password",
      "req.body.currentPassword",
      "req.body.newPassword",
      "req.body.refreshToken",
      "*.passwordHash",
    ],
    censor: "[REDACTED]",
  },
});
