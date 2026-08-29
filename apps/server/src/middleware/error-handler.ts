import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { logger } from "../utils/logger.js";

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

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.name = "ApiError";
    // Ensure prototype chain is correct for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Central error handling middleware.
 * Catches all thrown errors and formats consistent JSON responses.
 */
export function errorHandler(
  err: Error | AppError | ZodError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // 4xx are expected client errors; only log 5xx at error level
  const statusCode = (err as AppError).statusCode;
  const meta = { err, requestId: req.headers["x-request-id"], path: req.path };
  if (statusCode && statusCode < 500) {
    logger.warn(meta, err.message);
  } else {
    logger.error(meta, err.message);
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const details = err.issues.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }));
    res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details,
      },
    });
    return;
  }

  // Handle our custom API errors
  if (err instanceof ApiError) {
    const response: {
      success: false;
      error: {
        code: string;
        message: string;
        details?: Array<{ field: string; message: string }>;
      };
    } = {
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
  const maybeMongoError = err as Error & {
    code?: number;
    keyValue?: Record<string, unknown>;
    path?: string;
  };
  if (maybeMongoError.code === 11000) {
    res.status(409).json({
      success: false,
      error: {
        code: "DUPLICATE_ENTRY",
        message: "A record with this value already exists.",
        details: [
          {
            field: Object.keys(maybeMongoError.keyValue || {})[0] || "unknown",
            message: "Already exists",
          },
        ],
      },
    });
    return;
  }

  // Handle Mongoose cast errors (invalid ObjectId)
  if (maybeMongoError.name === "CastError") {
    res.status(400).json({
      success: false,
      error: {
        code: "INVALID_ID",
        message: `Invalid ${maybeMongoError.path || "id"} format.`,
      },
    });
    return;
  }

  // Generic fallback
  const isDev = process.env.NODE_ENV !== "production";
  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: isDev ? err.message : "Internal server error",
      ...(isDev && err instanceof Error && { stack: err.stack }),
    },
  });
}

/**
 * Async route wrapper to catch errors in async controllers.
 * Usage: router.get('/path', asyncHandler(controllerFn))
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
