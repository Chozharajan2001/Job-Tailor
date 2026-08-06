import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { Secret, SignOptions } from 'jsonwebtoken';
import { config } from '../config/index.js';
import { ApiError } from '../middleware/error-handler.js';
import { User } from '../models/User.model.js';
import { sendPasswordResetEmail } from './email.service.js';

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
  return jwt.sign(payload, config.jwt.secret as Secret, { expiresIn: config.jwt.expiry as SignOptions['expiresIn'] });
}

function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwt.refreshSecret as Secret, { expiresIn: config.jwt.refreshExpiry as SignOptions['expiresIn'] });
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
    throw new ApiError(
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
    user: sanitizeUser(user.toObject() as unknown as Record<string, unknown>),
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
    throw new ApiError(
      401,
      'INVALID_CREDENTIALS',
      'Invalid email or password'
    );
  }

  if (!user.isActive) {
    throw new ApiError(
      403,
      'ACCOUNT_DEACTIVATED',
      'This account has been deactivated. Please contact support.'
    );
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new ApiError(
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
    throw new ApiError(
      401,
      'INVALID_REFRESH_TOKEN',
      'Invalid or expired refresh token. Please login again.'
    );
  }

  // Verify user still exists and is active
  const user = await User.findById(payload.userId).select('+isActive').lean();
  if (!user || !user.isActive) {
    throw new ApiError(
      401,
      'AUTH_INVALID_TOKEN',
      'User not found or account deactivated.'
    );
  }

  // Generate new token pair
  return generateTokens({ _id: user._id.toString(), email: user.email });
}

// ─── Password Reset ──────────────────────────────────────────────

/**
 * Request a password reset. Generates a token and sends reset email.
 * Always returns success to prevent user enumeration.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await User.findOne({ email: email.toLowerCase() });

  // Always return silently — don't reveal whether email exists
  if (!user) {
    return;
  }

  // Generate a random token
  const plainToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = await bcrypt.hash(plainToken, config.bcryptRounds);

  // Calculate expiry (parse config like '1h', '30m', etc.)
  const expiresAt = new Date(Date.now() + parseExpiryMs(config.resetPasswordExpiry));

  await User.findByIdAndUpdate(user._id, {
    resetPasswordToken: hashedToken,
    resetPasswordExpires: expiresAt,
  });

  // Build reset URL with frontend URL from config
  const resetUrl = `${config.email.frontendUrl}/reset-password/${plainToken}`;

  // Send password reset email
  await sendPasswordResetEmail(user.email, resetUrl, expiresAt);
}

/**
 * Reset password using a valid token.
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  // Find any user with a reset token that hasn't expired
  const users = await User.find({
    resetPasswordExpires: { $gt: new Date() },
  }).select('+resetPasswordToken').lean();

  let matchedUser: typeof users[0] | null = null;

  for (const user of users) {
    if (user.resetPasswordToken) {
      const isMatch = await bcrypt.compare(token, user.resetPasswordToken);
      if (isMatch) {
        matchedUser = user;
        break;
      }
    }
  }

  if (!matchedUser) {
    throw new ApiError(400, 'INVALID_RESET_TOKEN', 'Invalid or expired reset token.');
  }

  // Hash the new password
  const passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds);

  // Update user: set new password and clear reset fields
  await User.findByIdAndUpdate(matchedUser._id, {
    passwordHash,
    $unset: { resetPasswordToken: 1, resetPasswordExpires: 1 },
  });
}

/**
 * Parse a human-friendly expiry string (e.g. '1h', '30m', '2d') into milliseconds.
 */
function parseExpiryMs(expiry: string): number {
  const match = expiry.match(/^(\d+)([mhd])$/);
  if (!match) return 60 * 60 * 1000; // fallback: 1 hour

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 60 * 60 * 1000;
  }
}

// ─── Helpers ────────────────────────────────────────────────────

/** Remove sensitive fields from user object */
function sanitizeUser(user: Record<string, unknown>) {
  const sanitized = { ...user };
  delete sanitized['passwordHash'];
  return sanitized;
}
