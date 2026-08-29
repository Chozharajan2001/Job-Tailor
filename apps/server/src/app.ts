import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { pinoHttp } from "pino-http";
import { randomUUID } from "crypto";
import { config, validateConfig } from "./config/index.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { errorHandler, asyncHandler } from "./middleware/error-handler.js";
import { startStaleCleanupScheduler } from "./jobs/stale-cleanup.job.js";
import { closePdfBrowser } from "./services/pdf-generator.service.js";
import { logger } from "./utils/logger.js";

// Validate environment config
validateConfig();

const app = express();

// Behind Render/Vercel proxies this gives us the real client IP
// (correct rate-limit keys and audit-log attribution)
app.set("trust proxy", 1);

// ─── Security Middleware ────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);

      const allowedOrigins = Array.isArray(config.corsOrigin)
        ? config.corsOrigin
        : [config.corsOrigin];

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);

// ─── Rate Limiting ─────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.nodeEnv === "production" ? 100 : 500,
  message: {
    success: false,
    error: {
      code: "RATE_LIMITED",
      message: "Too many requests, please try again later.",
    },
  },
});
app.use("/api/", limiter);

// ─── Body Parsing ──────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// ─── Request Logging (structured, with correlation IDs) ────────────
app.use(
  pinoHttp({
    logger,
    genReqId: (req, res) => {
      const id = (req.headers["x-request-id"] as string) || randomUUID();
      res.setHeader("X-Request-Id", id);
      return id;
    },
    autoLogging: {
      // Health checks would flood the logs
      ignore: (req) => req.url === "/health",
    },
  }),
);

// ─── Health Check ──────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ─── API Routes (to be added in Phase 2+) ─────────────────────────
app.use("/api/v1/auth", (await import("./routes/auth.routes.js")).default);
app.use(
  "/api/v1/profile",
  (await import("./routes/profile.routes.js")).default,
);
app.use("/api/v1/jobs", (await import("./routes/job.routes.js")).default);
app.use("/api/v1/resumes", (await import("./routes/resume.routes.js")).default);
app.use(
  "/api/v1/applications",
  (await import("./routes/application.routes.js")).default,
);
app.use(
  "/api/v1/analytics",
  (await import("./routes/analytics.routes.js")).default,
);
app.use("/api/v1/search", (await import("./routes/search.routes.js")).default);

// ─── 404 Handler ───────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: "Endpoint not found" },
  });
});

// ─── Global Error Handler (custom — handles Zod, Mongoose, ApiError) ──
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use(errorHandler);

// ─── Start Server ──────────────────────────────────────────────────
let server: ReturnType<typeof app.listen> | undefined;

async function startServer(): Promise<void> {
  await connectDatabase();

  server = app.listen(config.port, () => {
    console.log(`\n🚀 JobTailor Server running:`);
    console.log(`   Mode   : ${config.nodeEnv}`);
    console.log(`   URL    : http://localhost:${config.port}`);
    console.log(`   Health : http://localhost:${config.port}/health\n`);
  });

  // Scheduled background maintenance (stale-job deactivation & link checks)
  startStaleCleanupScheduler();
}

// ─── Graceful Shutdown ─────────────────────────────────────────────
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\n🛑 ${signal} received — shutting down gracefully...`);
  try {
    await closePdfBrowser();
    server?.close();
    await disconnectDatabase();
  } catch (err) {
    console.error("Error during shutdown:", err);
  } finally {
    process.exit(0);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// In test mode the app is imported by supertest — the DB is connected by the
// test harness and no port should be bound.
if (config.nodeEnv !== "test") {
  startServer();
}

export default app;
