import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  register,
  login,
  refresh,
  getMe,
  logoutHandler,
  logoutAll,
  forgotPassword,
  resetPasswordHandler,
  changePasswordHandler,
  verifyEmailHandler,
  resendVerificationHandler,
} from '../controllers/auth.controller.js';
import { validateBody } from '../middleware/validation.js';

const router = Router();

// ─── Rate Limiters ─────────────────────────────────────────────────
// Stricter limiter for sensitive auth endpoints
const strictAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes
  message: { success: false, error: { code: 'AUTH_RATE_LIMITED', message: 'Too many attempts, please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
});

// Standard limiter for less sensitive endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: { code: 'AUTH_RATE_LIMITED', message: 'Too many attempts, please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Validation Schemas ────────────────────────────────────────────
const registerSchema = z.object({
  email: z.string().email('Must be a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Must contain at least one number'),
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  fingerprint: z.object({
    userAgent: z.string().optional(),
    language: z.string().optional(),
    platform: z.string().optional(),
    screenResolution: z.string().optional(),
    timezone: z.string().optional(),
  }).optional(),
});

const loginSchema = z.object({
  email: z.string().email('Must be a valid email address'),
  password: z.string().min(1, 'Password is required'),
  fingerprint: z.object({
    userAgent: z.string().optional(),
    language: z.string().optional(),
    platform: z.string().optional(),
    screenResolution: z.string().optional(),
    timezone: z.string().optional(),
  }).optional(),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().optional(),
  fingerprint: z.object({
    userAgent: z.string().optional(),
    language: z.string().optional(),
    platform: z.string().optional(),
    screenResolution: z.string().optional(),
    timezone: z.string().optional(),
  }).optional(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Must be a valid email address'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Must contain at least one number'),
});

const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

const resendVerificationSchema = z.object({
  email: z.string().email('Must be a valid email address'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Must contain at least one number'),
});

const resendVerificationSchemaBody = z.object({
  email: z.string().email('Must be a valid email address'),
});

// ─── Routes ────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/register
 * @desc Register a new user account
 * @access Public (rate limited)
 */
router.post('/register', authLimiter, validateBody(registerSchema), register);

/**
 * POST /api/v1/auth/verify-email
 * @desc Verify email with token
 * @access Public (rate limited)
 */
router.post('/verify-email', authLimiter, validateBody(verifyEmailSchema), verifyEmailHandler);

/**
 * POST /api/v1/auth/resend-verification
 * @desc Resend email verification link
 * @access Public (rate limited)
 */
router.post('/resend-verification', authLimiter, validateBody(resendVerificationSchemaBody), resendVerificationHandler);

/**
 * POST /api/v1/auth/login
 * @desc Login and get JWT tokens
 * @access Public (rate limited)
 */
router.post('/login', strictAuthLimiter, validateBody(loginSchema), login);

/**
 * POST /api/v1/auth/refresh
 * @desc Refresh access token using refresh token (with rotation)
 * @access Public
 */
router.post('/refresh', authLimiter, validateBody(refreshTokenSchema), refresh);

/**
 * GET /api/v1/auth/me
 * @desc Get current authenticated user info
 * @access Private
 */
router.get('/me', authenticate, getMe);

/**
 * POST /api/v1/auth/logout
 * @desc Logout & invalidate current session
 * @access Private
 */
router.post('/logout', authenticate, logoutHandler);

/**
 * POST /api/v1/auth/logout-all
 * @desc Revoke all sessions (logout everywhere)
 * @access Private
 */
router.post('/logout-all', authenticate, logoutAll);

/**
 * POST /api/v1/auth/forgot-password
 * @desc Request a password reset link
 * @access Public (rate limited)
 */
router.post('/forgot-password', strictAuthLimiter, validateBody(forgotPasswordSchema), forgotPassword);

/**
 * POST /api/v1/auth/reset-password
 * @desc Reset password using a valid token
 * @access Public
 */
router.post('/reset-password', authLimiter, validateBody(resetPasswordSchema), resetPasswordHandler);

/**
 * POST /api/v1/auth/change-password
 * @desc Change password for authenticated user
 * @access Private
 */
router.post('/change-password', authenticate, validateBody(changePasswordSchema), changePasswordHandler);

/**
 * POST /api/v1/auth/resend-verification (legacy)
 * @desc Resend email verification link
 * @access Public (rate limited)
 */
router.post('/resend-verification-legacy', authLimiter, validateBody(resendVerificationSchema), resendVerificationHandler);

export default router;