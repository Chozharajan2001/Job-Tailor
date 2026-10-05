import dotenv from "dotenv";

dotenv.config({ path: ".env" });

export const config = {
  port: parseInt(process.env.PORT || "5000", 10),
  nodeEnv: process.env.NODE_ENV || "development",

  mongodb: {
    uri: process.env.MONGODB_URI || "",
  },

  jwt: {
    secret: process.env.JWT_SECRET || "",
    refreshSecret: process.env.JWT_REFRESH_SECRET || "",
    expiry: process.env.JWT_EXPIRY || "15m",
    refreshExpiry: process.env.JWT_REFRESH_EXPIRE || "7d",
  },

  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || "12", 10),

  resetPasswordExpiry: process.env.RESET_PASSWORD_EXPIRY || "1h",

  emailVerificationExpiry: process.env.EMAIL_VERIFICATION_EXPIRY || "24h",

  maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || "5", 10),
  lockoutDuration:
    parseInt(process.env.LOCKOUT_DURATION_MINUTES || "15", 10) * 60 * 1000, // in milliseconds
  maxConcurrentSessions: parseInt(
    process.env.MAX_CONCURRENT_SESSIONS || "5",
    10,
  ),

  corsOrigin: process.env.CORS_ORIGIN?.split(",") || ["http://localhost:5173"],

  email: {
    host: process.env.SMTP_HOST || "",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.EMAIL_FROM || "noreply@jobtailor.app",
    fromName: process.env.EMAIL_FROM_NAME || "JobTailor",
    frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  },

  openaiApiKey: process.env.OPENAI_API_KEY || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  nvidiaNimApiKey: process.env.NVIDIA_NIM_API_KEY || "",
  nvidiaNimBaseUrl: process.env.NVIDIA_NIM_BASE_URL || "",
  nvidiaNimModel: process.env.NVIDIA_NIM_MODEL || "openai/gpt-oss-20b",
  preferredProvider: (process.env.PREFERRED_AI_PROVIDER || "openai") as
    | "openai"
    | "gemini"
    | "nvidia",

  /**
   * Shared secret that gates the /api/v1/admin/* endpoints used by the
   * external job-source poller (GitHub Action cron). When unset, the admin
   * routes return 503 rather than silently running with no auth.
   */
  sourcePollAdminKey: process.env.SOURCE_POLL_ADMIN_KEY || "",

  /**
   * Self-registration mode. The gate re-reads the environment per request
   * (see utils/registration-gate.ts) so sign-up can be opened or closed
   * without a restart; this copy exists so validateConfig can reject a typo
   * loudly at boot instead of failing closed in silence.
   */
  registrationMode: (process.env.REGISTRATION_MODE || "open")
    .trim()
    .toLowerCase(),

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
    apiKey: process.env.CLOUDINARY_API_KEY || "",
    apiSecret: process.env.CLOUDINARY_API_SECRET || "",
    folder: process.env.CLOUDINARY_FOLDER || "jobtailor/resumes",
  },
} as const;

export function validateConfig(): void {
  if (!config.mongodb.uri) throw new Error("MONGODB_URI is required");
  // Fail fast in every environment — never run with weak or missing JWT secrets
  if (!config.jwt.secret || config.jwt.secret.length < 32) {
    throw new Error(
      "JWT_SECRET is required (min 32 chars). Generate one with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"",
    );
  }
  if (!config.jwt.refreshSecret || config.jwt.refreshSecret.length < 32) {
    throw new Error(
      "JWT_REFRESH_SECRET is required (min 32 chars). Generate one with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"",
    );
  }
  if (config.jwt.secret === config.jwt.refreshSecret) {
    throw new Error(
      "JWT_SECRET and JWT_REFRESH_SECRET must be different values",
    );
  }
  // A short admin key is brute-forceable over the network. Leaving it unset is
  // still valid — the admin routes then answer 503 instead of running unguarded.
  if (config.sourcePollAdminKey && config.sourcePollAdminKey.length < 32) {
    throw new Error(
      "SOURCE_POLL_ADMIN_KEY must be at least 32 chars when set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  // An unrecognised REGISTRATION_MODE would otherwise fail closed in silence
  if (!["open", "allowlist", "closed"].includes(config.registrationMode)) {
    throw new Error(
      `REGISTRATION_MODE must be one of open, allowlist, closed (got "${config.registrationMode}")`,
    );
  }
  if (config.nodeEnv === "production") {
    const hasOpenAI = !!config.openaiApiKey;
    const hasGemini = !!config.geminiApiKey;
    const hasNvidia = !!config.nvidiaNimApiKey && !!config.nvidiaNimBaseUrl;
    if (!hasOpenAI && !hasGemini && !hasNvidia) {
      throw new Error(
        "At least one AI provider (OpenAI, Gemini, or NVIDIA NIM) must be fully configured in production",
      );
    }
  }
}
