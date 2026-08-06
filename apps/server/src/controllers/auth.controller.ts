import { Request, Response } from 'express';
import { registerUser, loginUser, refreshTokenService, generateTokens, requestPasswordReset, resetPassword } from '../services/auth.service.js';
import { User } from '../models/User.model.js';

/**
 * POST /api/v1/auth/register
 * Register a new user account.
 */
export async function register(req: Request, res: Response): Promise<void> {
  const result = await registerUser(req.body);

  res.status(201).json({
    success: true,
    data: {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    },
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

  const result = await loginUser(email, password);

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

  const tokens = await refreshTokenService(refreshTokenString);

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
 * Invalidate session by clearing cookies.
 */
export async function logout(_req: Request, res: Response): Promise<void> {
  res.clearCookie('refreshToken', { path: '/api/v1/auth/refresh' });

  res.json({ success: true, data: { message: 'Logged out successfully.' } });
}

/**
 * POST /api/v1/auth/forgot-password
 * Request a password reset link (sent via email).
 */
export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const { email } = req.body;
  await requestPasswordReset(email);

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
  await resetPassword(token, password);

  res.json({
    success: true,
    data: { message: 'Password has been reset successfully.' },
  });
}
