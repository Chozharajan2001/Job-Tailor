import { Router } from 'express';
import { z } from 'zod';
import { register, login, refresh, getMe, logout, forgotPassword, resetPasswordHandler } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.js';

const router = Router();

// ─── Validation Schemas ────────────────────────────────────────
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
});

const loginSchema = z.object({
  email: z.string().email('Must be a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().optional(),
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

// ─── Routes ────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/register
 * @desc Register a new user account
 * @access Public (rate limited)
 */
router.post('/register', validateBody(registerSchema), register);

/**
 * POST /api/v1/auth/login
 * @desc Login and get JWT tokens
 * @access Public (rate limited)
 */
router.post('/login', validateBody(loginSchema), login);

/**
 * POST /api/v1/auth/refresh
 * @desc Refresh access token using refresh token
 * @access Public
 */
router.post('/refresh', validateBody(refreshTokenSchema), refresh);

/**
 * GET /api/v1/auth/me
 * @desc Get current authenticated user info
 * @access Private
 */
router.get('/me', authenticate, getMe);

/**
 * POST /api/v1/auth/logout
 * @desc Logout & invalidate session
 * @access Private
 */
router.post('/logout', authenticate, logout);

/**
 * POST /api/v1/auth/forgot-password
 * @desc Request a password reset link
 * @access Public
 */
router.post('/forgot-password', validateBody(forgotPasswordSchema), forgotPassword);

/**
 * POST /api/v1/auth/reset-password
 * @desc Reset password using a valid token
 * @access Public
 */
router.post('/reset-password', validateBody(resetPasswordSchema), resetPasswordHandler);

export default router;
