import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { errorHandler } from './error-handler.js';

/**
 * Validates request body against a Zod schema.
 * Returns 400 with validation details if invalid.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.body);

      if (!result.success) {
        const details = result.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));

        const error = new errorHandler.ApiError(
          400,
          'VALIDATION_ERROR',
          'Request body validation failed',
          details
        );
        throw error;
      }

      // Replace body with validated (and potentially transformed) data
      req.body = result.data;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Validates request query params against a Zod schema.
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.query);

      if (!result.success) {
        const details = result.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));

        const error = new errorHandler.ApiError(
          400,
          'VALIDATION_ERROR',
          'Query parameter validation failed',
          details
        );
        throw error;
      }

      req.query = result.data as unknown as Record<string, string>;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Validates URL params against a Zod schema.
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.params);

      if (!result.success) {
        const details = result.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));

        const error = new errorHandler.ApiError(
          400,
          'VALIDATION_ERROR',
          'URL parameter validation failed',
          details
        );
        throw error;
      }

      req.params = result.data as unknown as Record<string, string>;
      next();
    } catch (error) {
      next(error);
    }
  };
}
