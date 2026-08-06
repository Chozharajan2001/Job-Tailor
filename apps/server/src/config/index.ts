import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  mongodb: {
    uri: process.env.MONGODB_URI || '',
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || 'fallback-secret-change-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret-change-in-production',
    expiry: process.env.JWT_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRE || '7d',
  },

  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),

  resetPasswordExpiry: process.env.RESET_PASSWORD_EXPIRY || '1h',

  emailVerificationExpiry: process.env.EMAIL_VERIFICATION_EXPIRY || '24h',

  maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10),
  lockoutDuration: parseInt(process.env.LOCKOUT_DURATION_MINUTES || '15', 10) * 60 * 1000, // in milliseconds
  maxConcurrentSessions: parseInt(process.env.MAX_CONCURRENT_SESSIONS || '5', 10),

  corsOrigin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],

  email: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || 'noreply@jobtailor.app',
    fromName: process.env.EMAIL_FROM_NAME || 'JobTailor',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  },

  openaiApiKey: process.env.OPENAI_API_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  nvidiaNimApiKey: process.env.NVIDIA_NIM_API_KEY || '',
  nvidiaNimBaseUrl: process.env.NVIDIA_NIM_BASE_URL || '',
  nvidiaNimModel: process.env.NVIDIA_NIM_MODEL || 'openai/gpt-oss-20b',
  preferredProvider: (process.env.PREFERRED_AI_PROVIDER || 'openai') as 'openai' | 'gemini' | 'nvidia',
  
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    folder: process.env.CLOUDINARY_FOLDER || 'jobtailor/resumes',
  },
} as const;

export function validateConfig(): void {
  if (!config.mongodb.uri) throw new Error('MONGODB_URI is required');
  if (!config.jwt.secret || config.jwt.secret.includes('fallback')) {
    if (config.nodeEnv === 'production') throw new Error('JWT_SECRET must be set in production');
    console.warn('⚠️  Using default JWT secret — set JWT_SECRET in production');
  }
  if (!config.jwt.refreshSecret || config.jwt.refreshSecret.includes('fallback')) {
    if (config.nodeEnv === 'production') throw new Error('JWT_REFRESH_SECRET must be set in production');
    console.warn('⚠️  Using default JWT refresh secret — set JWT_REFRESH_SECRET in production');
  }
  if (config.nodeEnv === 'production') {
    const hasOpenAI = !!config.openaiApiKey;
    const hasGemini = !!config.geminiApiKey;
    const hasNvidia = !!config.nvidiaNimApiKey && !!config.nvidiaNimBaseUrl;
    if (!hasOpenAI && !hasGemini && !hasNvidia) {
      throw new Error('At least one AI provider (OpenAI, Gemini, or NVIDIA NIM) must be fully configured in production');
    }
  }
}
