import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { Secret, SignOptions } from "jsonwebtoken";
import { config } from "../config/index.js";
import { ApiError } from "../middleware/error-handler.js";
import { User, IUser } from "../models/User.model.js";
import { ObjectId } from "mongoose";
import { sendPasswordResetEmail } from "./email.service.js";
import { auditLogger } from "./audit-logger.service.js";

// ─── Types ──────────────────────────────────────────────────────────
interface TokenPayload {
  userId: string;
  email: string;
}

interface RefreshTokenPayload extends TokenPayload {
  /** Unique session identifier (JWT `jti` claim) — one per device/login */
  sessionId: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** SHA-256 hex of the refresh token, stored per-session for equality lookups */
  refreshTokenHash: string;
  refreshTokenExpires: Date;
  sessionId: string;
}

interface FullUser {
  _id: any;
  email: string;
  firstName: string;
  lastName: string;
  role: "user" | "admin";
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
  activeSessions: Array<{
    sessionId: string;
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
  role: "user" | "admin";
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
  sessionId: string;
  refreshTokenHash: string;
  userAgent: string;
  ip: string;
  fingerprintHash?: string;
  createdAt: Date;
  lastUsedAt: Date;
}

// ─── Token Generation ───────────────────────────────────────────────
function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwt.secret as Secret, {
    expiresIn: config.jwt.expiry as SignOptions["expiresIn"],
  });
}

function generateRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, config.jwt.refreshSecret as Secret, {
    expiresIn: config.jwt.refreshExpiry as SignOptions["expiresIn"],
    // Unique token id — guarantees a rotated token differs from its
    // predecessor even when issued within the same second (same iat)
    jwtid: crypto.randomUUID(),
  });
}

/**
 * Generate a cryptographically secure random token
 */
function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Fast, deterministic hash for HIGH-ENTROPY tokens (refresh/verification/reset).
 * SHA-256 is appropriate here because the inputs are 256-bit random values —
 * unlike passwords, they don't need slow hashing, and equality lookups are possible.
 */
function sha256Token(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
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
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      return 60 * 60 * 1000;
  }
}

/**
 * Refresh-token lifetime in ms, derived from JWT_REFRESH_EXPIRE config.
 */
export function getRefreshExpiryMs(): number {
  return parseExpiryMs(config.jwt.refreshExpiry);
}

/**
 * Generate token pair for a session.
 * When `sessionId` is provided (token rotation), the session identity is kept
 * stable so replayed pre-rotation tokens can still be detected as reuse;
 * otherwise a fresh sessionId is created (new login).
 * The refresh token is stored hashed (SHA-256) per session.
 */
export async function generateTokens(
  user: { _id: string; email: string },
  sessionId?: string,
): Promise<TokenPair> {
  const resolvedSessionId = sessionId || crypto.randomUUID();
  const payload: RefreshTokenPayload = {
    userId: user._id.toString(),
    email: user.email,
    sessionId: resolvedSessionId,
  };

  const accessToken = generateAccessToken({
    userId: user._id.toString(),
    email: user.email,
  });
  const refreshToken = generateRefreshToken(payload);
  const refreshTokenHash = sha256Token(refreshToken);
  const refreshTokenExpires = new Date(Date.now() + getRefreshExpiryMs());

  return {
    accessToken,
    refreshToken,
    refreshTokenHash,
    refreshTokenExpires,
    sessionId: resolvedSessionId,
  };
}

/**
 * Verify and decode a refresh token. Returns payload (incl. sessionId) if valid.
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    return jwt.verify(token, config.jwt.refreshSecret) as RefreshTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Create a session object for tracking active sessions
 */
function createSession(
  sessionId: string,
  refreshTokenHash: string,
  userAgent: string,
  ip: string,
  fingerprintHash?: string,
): SessionData {
  return {
    sessionId,
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
  return crypto.createHash("sha256").update(str).digest("hex");
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
  const existingUser = await User.findOne({
    email: input.email.toLowerCase(),
  }).lean();
  if (existingUser) {
    throw new ApiError(
      409,
      "EMAIL_EXISTS",
      "An account with this email already exists",
    );
  }

  // Hash password
  const passwordHash = await bcrypt.hash(input.password, config.bcryptRounds);

  // Generate email verification token (plaintext sent via email; only the
  // SHA-256 hash is stored so the DB can be queried directly)
  const verificationToken = generateSecureToken();
  const verificationTokenHash = sha256Token(verificationToken);
  const verificationExpires = new Date(
    Date.now() + parseExpiryMs(config.emailVerificationExpiry),
  );

  // Create user (not verified yet)
  const user = await User.create({
    email: input.email.toLowerCase(),
    passwordHash,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    role: "user",
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
 * Verify email with token — single indexed lookup on the stored SHA-256 hash.
 */
export async function verifyEmail(token: string): Promise<void> {
  const matchedUser = await User.findOne({
    emailVerificationToken: sha256Token(token),
    emailVerificationExpires: { $gt: new Date() },
  }).lean();

  if (!matchedUser) {
    throw new ApiError(
      400,
      "INVALID_VERIFICATION_TOKEN",
      "Invalid or expired verification token.",
    );
  }

  // Mark email as verified and clear verification fields
  await User.findByIdAndUpdate(matchedUser._id, {
    emailVerified: true,
    $unset: { emailVerificationToken: 1, emailVerificationExpires: 1 },
  });

  auditLogger.emailVerified({
    userId: matchedUser._id.toString(),
    ip: "unknown",
  });
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
  const verificationTokenHash = sha256Token(verificationToken);
  const verificationExpires = new Date(
    Date.now() + parseExpiryMs(config.emailVerificationExpiry),
  );

  await User.findByIdAndUpdate(user._id, {
    emailVerificationToken: verificationTokenHash,
    emailVerificationExpires: verificationExpires,
  });

  // Send verification email (controller handles this)
  auditLogger.emailVerificationSent({ email: user.email, ip: "unknown" });
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
  fingerprint?: Record<string, string>,
) {
  // Find user with password hash included
  const user = await User.findOne({ email: email.toLowerCase() })
    .select(
      "+passwordHash +loginAttempts +lockUntil +emailVerified +activeSessions",
    )
    .lean();

  if (!user) {
    auditLogger.loginFailed({ email, ip, userAgent, reason: "User not found" });
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  // Check if account is locked
  if (user.lockUntil && user.lockUntil > new Date()) {
    const lockDurationMinutes = Math.ceil(
      (user.lockUntil.getTime() - Date.now()) / (60 * 1000),
    );
    auditLogger.accountLocked({
      email,
      ip,
      attempts: user.loginAttempts,
      lockDuration: lockDurationMinutes,
    });
    throw new ApiError(
      423,
      "ACCOUNT_LOCKED",
      `Account temporarily locked. Try again in ${lockDurationMinutes} minutes.`,
    );
  }

  // Check email verification
  if (!user.emailVerified) {
    auditLogger.loginFailed({
      email,
      ip,
      userAgent,
      reason: "Email not verified",
    });
    throw new ApiError(
      403,
      "EMAIL_NOT_VERIFIED",
      "Please verify your email before logging in. Check your inbox for a verification link.",
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

    auditLogger.loginFailed({
      email,
      ip,
      userAgent,
      reason: "Invalid password",
      attempts: newAttempts,
    });

    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  // Password is correct - reset failed attempts and update last login
  await User.findByIdAndUpdate(user._id, {
    loginAttempts: 0,
    $unset: { lockUntil: 1, lastFailedLogin: 1 },
    lastLoginAt: new Date(),
  });

  // Generate tokens
  const tokens = await generateTokens({
    _id: user._id.toString(),
    email: user.email,
  });

  // Create session
  const fingerprintHash = fingerprint
    ? hashFingerprint(fingerprint)
    : undefined;
  const session = createSession(
    tokens.sessionId,
    tokens.refreshTokenHash,
    userAgent,
    ip,
    fingerprintHash,
  );

  // Enforce concurrent session limit
  const activeSessions = user.activeSessions || [];
  if (activeSessions.length >= config.maxConcurrentSessions) {
    // Remove oldest session
    activeSessions.sort(
      (a, b) => a.lastUsedAt.getTime() - b.lastUsedAt.getTime(),
    );
    activeSessions.shift();
    auditLogger.sessionRevoked({
      userId: user._id.toString(),
      reason: "concurrent_limit",
      ip,
    });
  }

  activeSessions.push(session);

  await User.findByIdAndUpdate(user._id, {
    activeSessions,
  });

  auditLogger.loginSuccess({
    userId: user._id.toString(),
    ip,
    userAgent,
    fingerprintHash,
  });

  return {
    user: sanitizeUser(user),
    ...tokens,
  };
}

/**
 * Refresh an access token using a valid refresh token.
 * Implements token rotation: the session's old refresh token is invalidated
 * and a new one issued. Each device/session rotates independently, so
 * multi-device logins work without interfering with each other.
 */
export async function refreshTokenService(
  refreshTokenString: string,
  userAgent: string,
  ip: string,
  fingerprint?: Record<string, string>,
): Promise<TokenPair> {
  const payload = verifyRefreshToken(refreshTokenString);
  if (!payload || !payload.sessionId) {
    throw new ApiError(
      401,
      "INVALID_REFRESH_TOKEN",
      "Invalid or expired refresh token. Please login again.",
    );
  }

  const user = await User.findById(payload.userId).lean();

  if (!user || !user.isActive) {
    throw new ApiError(
      401,
      "AUTH_INVALID_TOKEN",
      "User not found or account deactivated.",
    );
  }

  const sessions = user.activeSessions || [];
  const session = sessions.find((s) => s.sessionId === payload.sessionId);

  if (!session) {
    // Session was revoked (logout / password change / security event)
    throw new ApiError(
      401,
      "INVALID_REFRESH_TOKEN",
      "Session expired. Please login again.",
    );
  }

  // Verify the refresh token matches the stored hash for THIS session
  if (session.refreshTokenHash !== sha256Token(refreshTokenString)) {
    // Hash mismatch on a known session — possible token reuse/forgery.
    // Revoke all sessions for this user as a security measure.
    await revokeAllUserTokens(user._id.toString(), "token_reuse_detected");
    auditLogger.tokenRevoked({
      userId: payload.userId,
      reason: "token_reuse_detected",
      ip,
    });
    throw new ApiError(
      401,
      "TOKEN_REUSE_DETECTED",
      "Security violation detected. Please login again.",
    );
  }

  // Rotate: new refresh token, SAME sessionId (so replaying the old token
  // hits this session and fails the hash check → reuse detection).
  const tokens = await generateTokens(
    { _id: user._id.toString(), email: user.email },
    payload.sessionId,
  );
  const fingerprintHash = fingerprint
    ? hashFingerprint(fingerprint)
    : undefined;

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        "activeSessions.$[session].refreshTokenHash": tokens.refreshTokenHash,
        "activeSessions.$[session].userAgent": userAgent,
        "activeSessions.$[session].ip": ip,
        "activeSessions.$[session].lastUsedAt": new Date(),
        ...(fingerprintHash
          ? { "activeSessions.$[session].fingerprintHash": fingerprintHash }
          : {}),
      },
    },
    { arrayFilters: [{ "session.sessionId": payload.sessionId }] },
  );

  auditLogger.tokenRefreshed({ userId: payload.userId, ip, fingerprintHash });

  return tokens;
}

/**
 * Revoke a specific session identified by its refresh token (logout)
 */
export async function revokeRefreshToken(
  refreshTokenString: string,
  reason: string = "logout",
): Promise<void> {
  const payload = verifyRefreshToken(refreshTokenString);
  if (!payload?.sessionId) return;

  await User.updateOne(
    { _id: payload.userId },
    { $pull: { activeSessions: { sessionId: payload.sessionId } } },
  );

  auditLogger.tokenRevoked({ userId: payload.userId, reason });
}

/**
 * Revoke all refresh tokens for a user (logout everywhere / password change)
 */
export async function revokeAllUserTokens(
  userId: string,
  reason: string = "security",
): Promise<void> {
  const user = await User.findById(userId).select("activeSessions").lean();
  const sessionCount = user?.activeSessions?.length || 0;

  await User.findByIdAndUpdate(userId, {
    activeSessions: [],
  });

  if (reason === "logout_all") {
    auditLogger.logoutAll({ userId, ip: "unknown", sessionCount });
  } else {
    auditLogger.allSessionsRevoked({
      userId,
      reason,
      ip: "unknown",
      sessionCount,
    });
  }
}

/**
 * Logout - revoke the specific session tied to the given refresh token.
 * Other devices/sessions remain valid.
 * The user is derived from the (verified) token, so the session being
 * removed always belongs to its real owner.
 */
export async function logout(
  userId: string,
  refreshTokenString?: string,
): Promise<void> {
  if (refreshTokenString) {
    const payload = verifyRefreshToken(refreshTokenString);
    if (payload?.sessionId) {
      await User.updateOne(
        { _id: payload.userId },
        { $pull: { activeSessions: { sessionId: payload.sessionId } } },
      );
    }
  }

  auditLogger.tokenRevoked({ userId, reason: "logout" });
}

/**
 * Request a password reset. Generates a token and sends reset email.
 * Always returns success to prevent user enumeration.
 */
export async function requestPasswordReset(
  email: string,
  ip: string,
): Promise<void> {
  const user = await User.findOne({ email: email.toLowerCase() });

  // Always return silently — don't reveal whether email exists
  if (!user) {
    return;
  }

  // Generate a random token
  const plainToken = generateSecureToken();
  const hashedToken = sha256Token(plainToken);

  // Calculate expiry
  const expiresAt = new Date(
    Date.now() + parseExpiryMs(config.resetPasswordExpiry),
  );

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
 * Reset password using a valid token — single indexed lookup on the SHA-256 hash.
 */
export async function resetPassword(
  token: string,
  newPassword: string,
  ip: string,
): Promise<void> {
  const matchedUser = await User.findOne({
    resetPasswordToken: sha256Token(token),
    resetPasswordExpires: { $gt: new Date() },
  }).lean();

  if (!matchedUser) {
    throw new ApiError(
      400,
      "INVALID_RESET_TOKEN",
      "Invalid or expired reset token.",
    );
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

  auditLogger.passwordResetCompleted({
    userId: matchedUser._id.toString(),
    ip,
  });
}

/**
 * Change password (authenticated user)
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  ip: string,
): Promise<void> {
  const user = await User.findById(userId).select("+passwordHash").lean();

  if (!user) {
    throw new ApiError(404, "USER_NOT_FOUND", "User not found.");
  }

  const isPasswordValid = await bcrypt.compare(
    currentPassword,
    user.passwordHash,
  );
  if (!isPasswordValid) {
    throw new ApiError(
      401,
      "INVALID_CREDENTIALS",
      "Current password is incorrect.",
    );
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
export async function checkAccountLock(
  email: string,
): Promise<{ locked: boolean; lockUntil?: Date }> {
  const user = await User.findOne({ email: email.toLowerCase() })
    .select("lockUntil")
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
