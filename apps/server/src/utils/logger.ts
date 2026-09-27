import pino from "pino";
import { config } from "../config/index.js";

/**
 * Redaction paths for sensitive request material. pino-http's default request
 * serializer copies the whole header object onto every request/completion
 * line, so the extension bearer key (x-api-key) and the poller admin secret
 * (x-admin-key) would otherwise land in logs in plaintext — logs that reach
 * aggregators/dashboards with far weaker guarantees than the database.
 * Exported so the behavior is testable against a throwaway sink.
 */
export const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers.x-api-key",
  "req.headers.x-admin-key",
  "req.body.password",
  "req.body.currentPassword",
  "req.body.newPassword",
  "req.body.refreshToken",
  "*.passwordHash",
];

/**
 * Structured application logger (pino).
 * - JSON output in production for log aggregation
 * - Pretty output in development
 * - Sensitive fields are redacted (see REDACT_PATHS)
 */
export const logger = pino({
  level:
    process.env.LOG_LEVEL ||
    (config.nodeEnv === "production" ? "info" : "debug"),
  ...(config.nodeEnv !== "production"
    ? { transport: { target: "pino-pretty", options: { colorize: true } } }
    : {}),
  redact: {
    paths: REDACT_PATHS,
    censor: "[REDACTED]",
  },
});
