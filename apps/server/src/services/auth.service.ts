import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { User } from '../models/User.model.js';

// ─── Token Payload ──────────────────────────────────────────────
interface TokenPayload {
  userId: string;
  email: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// ─── Token Generation ───────────────────────────────────────────
function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiry });
}

function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiry });
}

/**
 * Generate both access and refresh tokens for a user.
 */
export function generateTokens(user: { _id: string; email: string }): TokenPair {
  const payload: TokenPayload = { userId: user._id.toString(), email: user.email };

  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
}

/**
 * Verify and decode a refresh token. Returns payload if valid.
 */
export function verifyRefreshToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, config.jwt.refreshSecret) as TokenPayload;
  } catch {
    return null;
  }
}

// ─── Auth Operations ─────────────────────────────────────────────
interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

/**
 * Register a new user account.
 */
export async function registerUser(input: RegisterInput) {
  // Check for existing email
  const existingUser = await User.findOne({ email: input.email.toLowerCase() }).lean();
  if (existingUser) {
    throw new (await import('../middleware/error-handler.js')).ApiError(
      409,
      'EMAIL_EXISTS',
      'An account with this email already exists'
    );
  }

  // Hash password
  const passwordHash = await bcrypt.hash(input.password, config.bcryptRounds);

  // Create user
  const user = await User.create({
    email: input.email.toLowerCase(),
    passwordHash,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    role: 'user',
  });

  // Generate tokens
  const tokens = generateTokens({ _id: user._id.toString(), email: user.email });

  return {
    user: sanitizeUser(user),
    ...tokens,
  };
}

/**
 * Authenticate user with email + password.
 */
export async function loginUser(email: string, password: string) {
  // Find user with password hash included
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash').lean();

  if (!user) {
    throw new (await import('../middleware/error-handler.js')).ApiError(
      401,
      'INVALID_CREDENTIALS',
      'Invalid email or password'
    );
  }

  if (!user.isActive) {
    throw new (await import('../middleware/error-handler.js')).ApiError(
      403,
      'ACCOUNT_DEACTIVATED',
      'This account has been deactivated. Please contact support.'
    );
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new (await import('../middleware/error-handler.js')).ApiError(
      401,
      'INVALID_CREDENTIALS',
      'Invalid email or password'
    );
  }

  // Update last login
  await User.findByIdAndUpdate(user._id, { lastLoginAt: new Date() });

  // Generate tokens
  const tokens = generateTokens({ _id: user._id.toString(), email: user.email });

  return {
    user: sanitizeUser(user),
    ...tokens,
  };
}

/**
 * Refresh an access token using a valid refresh token.
 */
export async function refreshTokenService(refreshTokenString: string): Promise<TokenPair> {
  const payload = verifyRefreshToken(refreshTokenString);
  if (!payload) {
    throw new (await import('../middleware/error-handler.js')).ApiError(
      401,
      'INVALID_REFRESH_TOKEN',
      'Invalid or expired refresh token. Please login again.'
    );
  }

  // Verify user still exists and is active
  const user = await User.findById(payload.userId).select('+isActive').lean();
  if (!user || !user.isActive) {
    throw new (await import('../middleware/error-handler.js')).ApiError(
      401,
      'AUTH_INVALID_TOKEN',
      'User not found or account deactivated.'
    );
  }

  // Generate new token pair
  return generateTokens({ _id: user._id.toString(), email: user.email });
}

// ─── Helpers ────────────────────────────────────────────────────

/** Remove sensitive fields from user object */
function sanitizeUser(user: Record<string, unknown>) {
  const sanitized = { ...user };
  delete sanitized.passwordHash;
  return sanitized;
}
