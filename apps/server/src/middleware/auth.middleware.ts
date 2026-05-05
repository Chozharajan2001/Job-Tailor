import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { User } from '../models/User.model.js';

// Extend Express Request to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
      };
    }
  }
}

/**
 * Authenticate JWT token from Authorization header.
 * Attaches `user` (userId + email) to request if valid.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: { code: 'AUTH_MISSING_TOKEN', message: 'Access token required. Please log in.' },
      });
      return;
    }

    const token = authHeader.split(' ')[1];

    // Verify JWT
    const decoded = jwt.verify(token, config.jwt.secret) as {
      userId: string;
      email: string;
    };

    // Verify user still exists and is active
    const user = await User.findById(decoded.userId).select('+isActive').lean();

    if (!user || !user.isActive) {
      res.status(401).json({
        success: false,
        error: { code: 'AUTH_INVALID_TOKEN', message: 'User not found or account deactivated.' },
      });
      return;
    }

    req.user = { userId: decoded.userId, email: decoded.email };
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: { code: 'TOKEN_EXPIRED', message: 'Token has expired. Please refresh or login again.' },
      });
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        error: { code: 'TOKEN_INVALID', message: 'Invalid access token.' },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: { code: 'AUTH_ERROR', message: 'Authentication failed.' },
    });
  }
}

/**
 * Optional auth — attaches user if token present, but doesn't block unauthenticated requests.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, config.jwt.secret) as { userId: string; email: string };
      req.user = { userId: decoded.userId, email: decoded.email };
    } catch {
      // Token invalid but we don't block — this is optional auth
    }
  }

  next();
}
