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
  
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  openaiApiKey: process.env.OPENAI_API_KEY || '',
  
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
    console.warn('⚠️  Using default JWT secret — set JWT_SECRET in production');
  }
  if (config.nodeEnv === 'production') {
    if (!config.openaiApiKey) throw new Error('OPENAI_API_KEY is required in production');
  }
}
