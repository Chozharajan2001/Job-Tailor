import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config, validateConfig } from './config/index.js';
import { connectDatabase } from './config/database.js';
import { errorHandler, asyncHandler } from './middleware/error-handler.js';

// Validate environment config
validateConfig();

const app = express();

// ─── Security Middleware ────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  })
);

// ─── Rate Limiting ─────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.nodeEnv === 'production' ? 100 : 500,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later.' } },
});
app.use('/api/', limiter);

// Auth routes get stricter rate limiting
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 login/register attempts per hour
  message: { success: false, error: { code: 'AUTH_RATE_LIMITED', message: 'Too many auth attempts, please try again later.' } },
});

// ─── Body Parsing ──────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ─── Health Check ──────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// ─── API Routes (to be added in Phase 2+) ─────────────────────────
app.use('/api/v1/auth', authLimiter, (await import('./routes/auth.routes.js')).default);
app.use('/api/v1/profile', (await import('./routes/profile.routes.js')).default);
app.use('/api/v1/jobs', (await import('./routes/job.routes.js')).default);
app.use('/api/v1/resumes', (await import('./routes/resume.routes.js')).default);
app.use('/api/v1/applications', (await import('./routes/application.routes.js')).default);
app.use('/api/v1/analytics', (await import('./routes/analytics.routes.js')).default);
app.use('/api/v1/search', (await import('./routes/search.routes.js')).default);

// ─── 404 Handler ───────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Endpoint not found' },
  });
});

// ─── Global Error Handler (custom — handles Zod, Mongoose, ApiError) ──
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use(errorHandler);

// ─── Start Server ──────────────────────────────────────────────────
async function startServer(): Promise<void> {
  await connectDatabase();
  
  app.listen(config.port, () => {
    console.log(`\n🚀 JobTailor Server running:`);
    console.log(`   Mode   : ${config.nodeEnv}`);
    console.log(`   URL    : http://localhost:${config.port}`);
    console.log(`   Health : http://localhost:${config.port}/health\n`);
  });
}

startServer();

export default app;
