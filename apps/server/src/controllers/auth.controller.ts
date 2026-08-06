import { Request, Response } from 'express';
import {
  registerUser,
  loginUser,
  refreshTokenService,
  generateTokens,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
  resendVerificationEmail,
  logout,
  revokeAllUserTokens,
  logout as logoutService,
  changePassword,
} from '../services/auth.service.js';
import { sendPasswordResetEmail, sendVerificationEmail } from '../services/email.service.js';
import { User } from '../models/User.model.js';
import { config } from '../config/index.js';

interface RegisterResult {
  user: {
    _id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: 'user' | 'admin';
    isActive: boolean;
    lastLoginAt?: Date;
    createdAt: Date;
    updatedAt: Date;
  };
  verificationToken: string;
  verificationExpires: Date;
}

/**
 * POST /api/v1/auth/register
 * Register a new user account. Returns verification token for email sending.
 */
export async function register(req: Request, res: Response): Promise<void> {
  const { email, password, firstName, lastName } = req.body;

  const result: RegisterResult = await registerUser({ email, password, firstName, lastName });

  // Send verification email
  const verificationUrl = `${config.email.frontendUrl}/verify-email/${result.verificationToken}`;
  await sendVerificationEmail(result.user.email, verificationUrl, result.verificationExpires);

  res.status(201).json({
    success: true,
    data: {
      user: result.user,
      message: 'Registration successful. Please check your email to verify your account.',
      verificationExpires: result.verificationExpires,
    },
  });
}

/**
 * POST /api/v1/auth/verify-email
 * Verify email with token from email link
 */
export async function verifyEmailHandler(req: Request, res: Response): Promise<void> {
  const { token } = req.body;

  if (!token) {
    res.status(400).json({
      success: false,
      error: { code: 'MISSING_TOKEN', message: 'Verification token is required.' },
    });
    return;
  }

  await verifyEmail(token);

  res.json({
    success: true,
    data: { message: 'Email verified successfully. You can now log in.' },
  });
}

/**
 * POST /api/v1/auth/resend-verification
 * Resend email verification link
 */
export async function resendVerification(req: Request, res: Response): Promise<void> {
  const { email } = req.body;

  if (!email) {
    res.status(400).json({
      success: false,
      error: { code: 'MISSING_EMAIL', message: 'Email is required.' },
    });
    return;
  }

  await resendVerificationEmail(email);

  res.json({
    success: true,
    data: { message: 'If an account with that email exists and is unverified, a new verification link has been sent.' },
  });
}

/**
 * POST /api/v1/auth/login
 * Authenticate with email + password. Returns JWT tokens.
 */
export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_CREDENTIALS',
        message: 'Email and password are required.',
        details: !email ? [{ field: 'email', message: 'Email is required' }] : [{ field: 'password', message: 'Password is required' }],
      },
    });
    return;
  }

  // Extract client info for security logging
  const userAgent = req.headers['user-agent'] || 'unknown';
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const fingerprint = req.body.fingerprint; // Optional client fingerprint

  const result = await loginUser(email, password, userAgent, ip, fingerprint);

  // Set refresh token as httpOnly cookie (more secure for web clients)
  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/api/v1/auth/refresh',
  });

  res.status(200).json({
    success: true,
    data: {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken, // Also include in body for non-browser clients
    },
  });
}

/**
 * POST /api/v1/auth/refresh
 * Exchange a valid refresh token for a new access token pair.
 * Implements token rotation.
 */
export async function refresh(req: Request, res: Response): Promise<void> {
  // Get refresh token from cookie or body
  const refreshTokenString = req.cookies?.refreshToken || req.body?.refreshToken;

  if (!refreshTokenString) {
    res.status(401).json({
      success: false,
      error: { code: 'REFRESH_TOKEN_MISSING', message: 'Refresh token is required.' },
    });
    return;
  }

  // Extract client info
  const userAgent = req.headers['user-agent'] || 'unknown';
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const fingerprint = req.body.fingerprint;

  const tokens = await refreshTokenService(refreshTokenString, userAgent, ip, fingerprint);

  // Update cookie with new refresh token
  res.cookie('refreshToken', tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/api/v1/auth/refresh',
  });

  res.status(200).json({
    success: true,
    data: tokens,
  });
}

/**
 * GET /api/v1/auth/me
 * Return current authenticated user's profile info.
 */
export async function getMe(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHENTICATED', message: 'Not authenticated.' },
    });
    return;
  }

  const user = await User.findById(req.user.userId)
    .select('-passwordHash -__v')
    .lean();

  if (!user) {
    res.status(404).json({
      success: false,
      error: { code: 'USER_NOT_FOUND', message: 'User account not found.' },
    });
    return;
  }

  res.json({ success: true, data: { user } });
}

/**
 * POST /api/v1/auth/logout
 * Invalidate current session by revoking refresh token.
 */
export async function logoutHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHENTICATED', message: 'Not authenticated.' },
    });
    return;
  }

  const refreshTokenString = req.cookies?.refreshToken || req.body?.refreshToken;

  await logoutService(req.user.userId, refreshTokenString);

  // Clear cookie
  res.clearCookie('refreshToken', { path: '/api/v1/auth/refresh' });

  res.json({ success: true, data: { message: 'Logged out successfully.' } });
}

/**
 * POST /api/v1/auth/logout-all
 * Revoke all sessions for the user (logout everywhere)
 */
export async function logoutAll(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHENTICATED', message: 'Not authenticated.' },
    });
    return;
  }

  await revokeAllUserTokens(req.user.userId, 'logout_all');

  // Clear cookie
  res.clearCookie('refreshToken', { path: '/api/v1/auth/refresh' });

  res.json({ success: true, data: { message: 'Logged out from all devices.' } });
}

/**
 * POST /api/v1/auth/forgot-password
 * Request a password reset link (sent via email).
 */
export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const { email } = req.body;
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  await requestPasswordReset(email, ip);

  res.json({
    success: true,
    data: { message: 'If an account with that email exists, a password reset link has been sent to your email.' },
  });
}

/**
 * POST /api/v1/auth/reset-password
 * Reset password using a valid token.
 */
export async function resetPasswordHandler(req: Request, res: Response): Promise<void> {
  const { token, password } = req.body;
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  await resetPassword(token, password, ip);

  res.json({
    success: true,
    data: { message: 'Password has been reset successfully.' },
  });
}

/**
 * POST /api/v1/auth/change-password
 * Change password for authenticated user
 */
export async function changePasswordHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHENTICATED', message: 'Not authenticated.' },
    });
    return;
  }

  const { currentPassword, newPassword } = req.body;
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  if (!currentPassword || !newPassword) {
    res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'Current password and new password are required.' },
    });
    return;
  }

  await changePassword(req.user.userId, currentPassword, newPassword, ip);

  res.json({
    success: true,
    data: { message: 'Password changed successfully. You have been logged out from all devices.' },
  });
}

/**
 * POST /api/v1/auth/resend-verification
 * Resend email verification link
 */
export async function resendVerificationHandler(req: Request, res: Response): Promise<void> {
  const { email } = req.body;

  if (!email) {
    res.status(400).json({
      success: false,
      error: { code: 'MISSING_EMAIL', message: 'Email is required.' },
    });
    return;
  }

  await resendVerificationEmail(email);

  res.json({
    success: true,
    data: { message: 'If an account with that email exists and is unverified, a new verification link has been sent.' },
  });
}