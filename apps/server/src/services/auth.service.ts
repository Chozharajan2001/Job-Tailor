import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { Secret, SignOptions } from 'jsonwebtoken';
import { config } from '../config/index.js';
import { ApiError } from '../middleware/error-handler.js';
import { User, IUser } from '../models/User.model.js';
import { ObjectId } from 'mongoose';
import { sendPasswordResetEmail } from './email.service.js';
import { auditLogger } from './audit-logger.service.js';

// ─── Types ──────────────────────────────────────────────────────────
interface TokenPayload {
  userId: string;
  email: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenHash: string;
  refreshTokenExpires: Date;
}

interface FullUser {
  _id: any;
  email: string;
  firstName: string;
  lastName: string;
  role: 'user' | 'admin';
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  passwordHash: string;
  loginAttempts: number;
  lockUntil?: Date;
  lastFailedLogin?: Date;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  emailVerificationToken?: string;
  emailVerificationExpires?: Date;
  refreshTokenHash?: string;
  refreshTokenExpires?: Date;
  activeSessions: Array<{
    refreshTokenHash: string;
    userAgent: string;
    ip: string;
    fingerprintHash?: string;
    createdAt: Date;
    lastUsedAt: Date;
  }>;
  toObject?: () => Record<string, unknown>;
}

interface SanitizedUser {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'user' | 'admin';
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

interface SessionData {
  refreshTokenHash: string;
  userAgent: string;
  ip: string;
  fingerprintHash?: string;
  createdAt: Date;
  lastUsedAt: Date;
}

// ─── Token Generation ───────────────────────────────────────────────
function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwt.secret as Secret, { expiresIn: config.jwt.expiry as SignOptions['expiresIn'] });
}

function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwt.refreshSecret as Secret, { expiresIn: config.jwt.refreshExpiry as SignOptions['expiresIn'] });
}

/**
 * Generate a cryptographically secure random token
 */
function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a token using bcrypt
 */
async function hashToken(token: string): Promise<string> {
  return bcrypt.hash(token, config.bcryptRounds);
}

/**
 * Compare a plain token with its hash
 */
async function compareToken(token: string, hash: string): Promise<boolean> {
  return bcrypt.compare(token, hash);
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

/**
 * Generate token pair and hash the refresh token for storage
 */
export async function generateTokens(user: { _id: string; email: string }): Promise<TokenPair> {
  const payload: TokenPayload = { userId: user._id.toString(), email: user.email };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);
  const refreshTokenHash = await hashToken(refreshToken);
  const refreshExpiryMs = config.jwt.refreshExpiry.includes('d')
    ? parseExpiryMs(config.jwt.refreshExpiry)
    : 7 * 24 * 60 * 60 * 1000; // fallback 7 days
  const refreshTokenExpires = new Date(Date.now() + refreshExpiryMs);

  return {
    accessToken,
    refreshToken,
    refreshTokenHash,
    refreshTokenExpires,
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

/**
 * Create a session object for tracking active sessions
 */
function createSession(refreshTokenHash: string, userAgent: string, ip: string, fingerprintHash?: string): SessionData {
  return {
    refreshTokenHash,
    userAgent,
    ip,
    fingerprintHash,
    createdAt: new Date(),
    lastUsedAt: new Date(),
  };
}

/**
 * Hash a fingerprint for storage
 */
function hashFingerprint(fingerprint: Record<string, string>): string {
  const str = JSON.stringify(fingerprint);
  return crypto.createHash('sha256').update(str).digest('hex');
}

// ─── Auth Operations ────────────────────────────────────────────────

/**
 * Register a new user account.
 * User must verify email before they can login.
 */
export async function registerUser(input: RegisterInput): Promise<{
  user: SanitizedUser;
  verificationToken: string;
  verificationExpires: Date;
}> {
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

  // Generate email verification token
  const verificationToken = generateSecureToken();
  const verificationTokenHash = await hashToken(verificationToken);
  const verificationExpires = new Date(Date.now() + parseExpiryMs(config.emailVerificationExpiry));

  // Create user (not verified yet)
  const user = await User.create({
    email: input.email.toLowerCase(),
    passwordHash,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    role: 'user',
    emailVerified: false,
    emailVerificationToken: verificationTokenHash,
    emailVerificationExpires: verificationExpires,
    loginAttempts: 0,
    activeSessions: [],
  });

  // Send verification email
  // Note: We don't send tokens in response - user must verify email first
  // The actual email sending should be implemented in the controller

  return {
    user: sanitizeUser(user.toObject() as FullUser),
    verificationToken, // Only returned for email sending (not stored in DB)
    verificationExpires,
  };
}

/**
 * Verify email with token
 */
export async function verifyEmail(token: string): Promise<void> {
  const users = await User.find({
    emailVerificationExpires: { $gt: new Date() },
  }).select('+emailVerificationToken').lean();

  let matchedUser: typeof users[0] | null = null;

  for (const user of users) {
    if (user.emailVerificationToken) {
      const isMatch = await compareToken(token, user.emailVerificationToken);
      if (isMatch) {
        matchedUser = user;
        break;
      }
    }
  }

  if (!matchedUser) {
    throw new ApiError(400, 'INVALID_VERIFICATION_TOKEN', 'Invalid or expired verification token.');
  }

  // Mark email as verified and clear verification fields
  await User.findByIdAndUpdate(matchedUser._id, {
    emailVerified: true,
    $unset: { emailVerificationToken: 1, emailVerificationExpires: 1 },
  });

  auditLogger.emailVerified({ userId: matchedUser._id.toString(), ip: 'unknown' });
}

/**
 * Resend email verification
 */
export async function resendVerificationEmail(email: string): Promise<void> {
  const user = await User.findOne({ email: email.toLowerCase() });

  // Always return silently — don't reveal whether email exists
  if (!user) {
    return;
  }

  if (user.emailVerified) {
    return; // Already verified
  }

  // Generate new verification token
  const verificationToken = generateSecureToken();
  const verificationTokenHash = await hashToken(verificationToken);
  const verificationExpires = new Date(Date.now() + parseExpiryMs(config.emailVerificationExpiry));

  await User.findByIdAndUpdate(user._id, {
    emailVerificationToken: verificationTokenHash,
    emailVerificationExpires: verificationExpires,
  });

  // Send verification email (controller handles this)
  auditLogger.emailVerificationSent({ email: user.email, ip: 'unknown' });
}

/**
 * Authenticate user with email + password.
 * Includes brute force protection and email verification check.
 */
export async function loginUser(
  email: string,
  password: string,
  userAgent: string,
  ip: string,
  fingerprint?: Record<string, string>
) {
  // Find user with password hash included
  const user = await User.findOne({ email: email.toLowerCase() })
    .select('+passwordHash +loginAttempts +lockUntil +emailVerified +activeSessions')
    .lean();

  if (!user) {
    auditLogger.loginFailed({ email, ip, userAgent, reason: 'User not found' });
    throw new ApiError(
      401,
      'INVALID_CREDENTIALS',
      'Invalid email or password'
    );
  }

  // Check if account is locked
  if (user.lockUntil && user.lockUntil > new Date()) {
    const lockDurationMinutes = Math.ceil((user.lockUntil.getTime() - Date.now()) / (60 * 1000));
    auditLogger.accountLocked({ email, ip, attempts: user.loginAttempts, lockDuration: lockDurationMinutes });
    throw new ApiError(
      423,
      'ACCOUNT_LOCKED',
      `Account temporarily locked. Try again in ${lockDurationMinutes} minutes.`
    );
  }

  // Check email verification
  if (!user.emailVerified) {
    auditLogger.loginFailed({ email, ip, userAgent, reason: 'Email not verified' });
    throw new ApiError(
      403,
      'EMAIL_NOT_VERIFIED',
      'Please verify your email before logging in. Check your inbox for a verification link.'
    );
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    // Increment failed attempts
    const newAttempts = (user.loginAttempts || 0) + 1;
    const update: Record<string, unknown> = {
      loginAttempts: newAttempts,
      lastFailedLogin: new Date(),
    };

    // Lock account if max attempts reached
    if (newAttempts >= config.maxLoginAttempts) {
      update.lockUntil = new Date(Date.now() + config.lockoutDuration);
      auditLogger.accountLocked({
        email,
        ip,
        attempts: newAttempts,
        lockDuration: config.lockoutDuration / (60 * 1000),
      });
    }

    await User.findByIdAndUpdate(user._id, update);

    auditLogger.loginFailed({ email, ip, userAgent, reason: 'Invalid password', attempts: newAttempts });

    throw new ApiError(
      401,
      'INVALID_CREDENTIALS',
      'Invalid email or password'
    );
  }

  // Password is correct - reset failed attempts and update last login
  await User.findByIdAndUpdate(user._id, {
    loginAttempts: 0,
    $unset: { lockUntil: 1, lastFailedLogin: 1 },
    lastLoginAt: new Date(),
  });

  // Generate tokens
  const tokens = await generateTokens({ _id: user._id.toString(), email: user.email });

  // Create session
  const fingerprintHash = fingerprint ? hashFingerprint(fingerprint) : undefined;
  const session = createSession(tokens.refreshTokenHash, userAgent, ip, fingerprintHash);

  // Enforce concurrent session limit
  const activeSessions = user.activeSessions || [];
  if (activeSessions.length >= config.maxConcurrentSessions) {
    // Remove oldest session
    activeSessions.sort((a, b) => a.lastUsedAt.getTime() - b.lastUsedAt.getTime());
    const removed = activeSessions.shift()!;
    auditLogger.sessionRevoked({ userId: user._id.toString(), reason: 'concurrent_limit', ip });
  }

  activeSessions.push(session);

  await User.findByIdAndUpdate(user._id, {
    activeSessions,
    refreshTokenHash: tokens.refreshTokenHash,
    refreshTokenExpires: tokens.refreshTokenExpires,
  });

  auditLogger.loginSuccess({ userId: user._id.toString(), ip, userAgent, fingerprintHash });

  return {
    user: sanitizeUser(user),
    ...tokens,
  };
}

/**
 * Refresh an access token using a valid refresh token.
 * Implements token rotation: old refresh token is invalidated, new one issued.
 */
export async function refreshTokenService(refreshTokenString: string, userAgent: string, ip: string, fingerprint?: Record<string, string>): Promise<TokenPair> {
  const payload = verifyRefreshToken(refreshTokenString);
  if (!payload) {
    throw new ApiError(
      401,
      'INVALID_REFRESH_TOKEN',
      'Invalid or expired refresh token. Please login again.'
    );
  }

  // Find user with current refresh token hash
  const user = await User.findById(payload.userId)
    .select('+refreshTokenHash +refreshTokenExpires +isActive +activeSessions')
    .lean();

  if (!user || !user.isActive) {
    throw new ApiError(
      401,
      'AUTH_INVALID_TOKEN',
      'User not found or account deactivated.'
    );
  }

  // Check if refresh token exists and is not expired
  if (!user.refreshTokenHash || !user.refreshTokenExpires || user.refreshTokenExpires < new Date()) {
    throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token expired. Please login again.');
  }

  // Verify the refresh token matches the stored hash
  const isMatch = await compareToken(refreshTokenString, user.refreshTokenHash);
  if (!isMatch) {
    // Token doesn't match - possible token reuse attack!
    // Revoke all tokens for this user as a security measure
    await revokeAllUserTokens(user._id.toString(), 'token_reuse_detected');
    auditLogger.tokenRevoked({ userId: payload.userId, reason: 'token_reuse_detected', ip });
    throw new ApiError(401, 'TOKEN_REUSE_DETECTED', 'Security violation detected. Please login again.');
  }

  // Generate new token pair (rotation)
  const tokens = await generateTokens({ _id: user._id.toString(), email: user.email });

  // Update session's lastUsedAt and token hash
  const fingerprintHash = fingerprint ? hashFingerprint(fingerprint) : undefined;
  const activeSessions = (user.activeSessions || []).map((s: SessionData) =>
    s.refreshTokenHash === user.refreshTokenHash
      ? { ...s, refreshTokenHash: tokens.refreshTokenHash, lastUsedAt: new Date(), fingerprintHash }
      : s
  );

  await User.findByIdAndUpdate(user._id, {
    refreshTokenHash: tokens.refreshTokenHash,
    refreshTokenExpires: tokens.refreshTokenExpires,
    activeSessions,
  });

  auditLogger.tokenRefreshed({ userId: payload.userId, ip, fingerprintHash });

  return tokens;
}

/**
 * Revoke the current refresh token (logout)
 */
export async function revokeRefreshToken(userId: string, reason: string = 'logout'): Promise<void> {
  await User.findByIdAndUpdate(userId, {
    $unset: { refreshTokenHash: 1, refreshTokenExpires: 1 },
    $pull: { activeSessions: {} }, // Will need specific session removal in practice
  });

  auditLogger.tokenRevoked({ userId, reason });
}

/**
 * Revoke all refresh tokens for a user (logout everywhere / password change)
 */
export async function revokeAllUserTokens(userId: string, reason: string = 'security'): Promise<void> {
  const user = await User.findById(userId).select('activeSessions').lean();
  const sessionCount = user?.activeSessions?.length || 0;

  await User.findByIdAndUpdate(userId, {
    $unset: { refreshTokenHash: 1, refreshTokenExpires: 1 },
    activeSessions: [],
  });

  if (reason === 'logout_all') {
    auditLogger.logoutAll({ userId, ip: 'unknown', sessionCount });
  } else {
    auditLogger.allSessionsRevoked({ userId, reason, ip: 'unknown', sessionCount });
  }
}

/**
 * Logout - revoke specific session
 */
export async function logout(userId: string, refreshTokenString?: string): Promise<void> {
  if (refreshTokenString) {
    // Find and remove specific session
    const payload = verifyRefreshToken(refreshTokenString);
    if (payload) {
      const hash = await hashToken(refreshTokenString);
      await User.findByIdAndUpdate(userId, {
        $pull: { activeSessions: { refreshTokenHash: hash } },
      });
    }
  }

  // Also clear the main refresh token if this was the last/active one
  const user = await User.findById(userId).select('activeSessions').lean();
  if (!user?.activeSessions?.length) {
    await User.findByIdAndUpdate(userId, {
      $unset: { refreshTokenHash: 1, refreshTokenExpires: 1 },
    });
  }

  auditLogger.tokenRevoked({ userId, reason: 'logout' });
}

/**
 * Request a password reset. Generates a token and sends reset email.
 * Always returns success to prevent user enumeration.
 */
export async function requestPasswordReset(email: string, ip: string): Promise<void> {
  const user = await User.findOne({ email: email.toLowerCase() });

  // Always return silently — don't reveal whether email exists
  if (!user) {
    return;
  }

  // Generate a random token
  const plainToken = generateSecureToken();
  const hashedToken = await hashToken(plainToken);

  // Calculate expiry
  const expiresAt = new Date(Date.now() + parseExpiryMs(config.resetPasswordExpiry));

  await User.findByIdAndUpdate(user._id, {
    resetPasswordToken: hashedToken,
    resetPasswordExpires: expiresAt,
  });

  // Build reset URL with frontend URL from config
  const resetUrl = `${config.email.frontendUrl}/reset-password/${plainToken}`;

  // Send password reset email
  await sendPasswordResetEmail(user.email, resetUrl, expiresAt);

  auditLogger.passwordResetRequested({ email: user.email, ip });
}

/**
 * Reset password using a valid token.
 */
export async function resetPassword(token: string, newPassword: string, ip: string): Promise<void> {
  // Find any user with a reset token that hasn't expired
  const users = await User.find({
    resetPasswordExpires: { $gt: new Date() },
  }).select('+resetPasswordToken').lean();

  let matchedUser: typeof users[0] | null = null;

  for (const user of users) {
    if (user.resetPasswordToken) {
      const isMatch = await compareToken(token, user.resetPasswordToken);
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
  // Also revoke all sessions (security best practice)
  await User.findByIdAndUpdate(matchedUser._id, {
    passwordHash,
    $unset: { resetPasswordToken: 1, resetPasswordExpires: 1 },
    activeSessions: [],
  });

  auditLogger.passwordResetCompleted({ userId: matchedUser._id.toString(), ip });
}

/**
 * Change password (authenticated user)
 */
export async function changePassword(userId: string, currentPassword: string, newPassword: string, ip: string): Promise<void> {
  const user = await User.findById(userId).select('+passwordHash').lean();

  if (!user) {
    throw new ApiError(404, 'USER_NOT_FOUND', 'User not found.');
  }

  const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isPasswordValid) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
  }

  const passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds);

  // Revoke all sessions (security best practice)
  await User.findByIdAndUpdate(userId, {
    passwordHash,
    activeSessions: [],
  });

  auditLogger.passwordChanged({ userId, ip });
}

/**
 * Check if user account is locked
 */
export async function checkAccountLock(email: string): Promise<{ locked: boolean; lockUntil?: Date }> {
  const user = await User.findOne({ email: email.toLowerCase() })
    .select('lockUntil')
    .lean();

  if (!user) {
    return { locked: false };
  }

  if (user.lockUntil && user.lockUntil > new Date()) {
    return { locked: true, lockUntil: user.lockUntil };
  }

  return { locked: false };
}

// ─── Helpers ────────────────────────────────────────────────────

/** Remove sensitive fields from user object */
function sanitizeUser(user: FullUser): SanitizedUser {
  const sanitized: SanitizedUser = {
    _id: user._id.toString(),
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
  return sanitized;
}