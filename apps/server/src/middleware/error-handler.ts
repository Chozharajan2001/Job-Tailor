import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export interface AppError {
  code: string;
  message: string;
  statusCode: number;
  details?: Array<{ field: string; message: string }>;
}

export class ApiError extends Error implements AppError {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Array<{ field: string; message: string }>;

  constructor(statusCode: number, code: string, message: string, details?: Array<{ field: string; message: string }>) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.name = 'ApiError';
    // Ensure prototype chain is correct for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Central error handling middleware.
 * Catches all thrown errors and formats consistent JSON responses.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: Error | AppError | ZodError, _req: Request, res: Response, _next: NextFunction): void {
  console.error(`[ERROR] ${new Date().toISOString()}: ${err.message}`);

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details },
    });
    return;
  }

  // Handle our custom API errors
  if (err instanceof ApiError) {
    const response: Record<string, unknown> = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    };
    if (err.details) response.error.details = err.details;

    res.status(err.statusCode).json(response);
    return;
  }

  // Handle Mongoose duplicate key errors
  if ('code' in err && err.code === 11000) {
    res.status(409).json({
      success: false,
      error: {
        code: 'DUPLICATE_ENTRY',
        message: 'A record with this value already exists.',
        details: [
          { field: Object.keys((err as Record<string, unknown>).keyValue || {})[0], message: 'Already exists' },
        ],
      },
    });
    return;
  }

  // Handle Mongoose cast errors (invalid ObjectId)
  if (err.name === 'CastError') {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: `Invalid ${err.path} format.` },
    });
    return;
  }

  // Generic fallback
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: isDev ? err.message : 'Internal server error',
      ...(isDev && { stack: err.stack }),
    },
  });
}

/**
 * Async route wrapper to catch errors in async controllers.
 * Usage: router.get('/path', asyncHandler(controllerFn))
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
