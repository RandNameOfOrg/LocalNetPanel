import { Request, Response, NextFunction, RequestHandler, ErrorRequestHandler } from 'express';
import { z, ZodTypeAny } from 'zod';
import { AppError } from './errors';

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/**
 * Wraps an async route handler so rejected promises are forwarded to the
 * error middleware instead of crashing or hanging the request. Lets handlers
 * `throw` instead of repeating try/catch in every route.
 */
export const asyncHandler =
  (fn: AsyncRouteHandler): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

/** Validate a request body against a Zod schema, throwing AppError(400) on failure. */
export function parseBody<S extends ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError(400, 'Validation failed', result.error.flatten());
  }
  return result.data;
}

/** Read a required positive-integer query param, throwing AppError(400) if missing/invalid. */
export function requireIntQuery(req: Request, name: string): number {
  const value = Number(req.query[name]);
  if (!Number.isInteger(value) || value <= 0) {
    throw new AppError(400, `${name} query param is required`);
  }
  return value;
}

/** Read a route param as a number (e.g. ":id"). */
export function intParam(req: Request, name = 'id'): number {
  return Number((req.params as Record<string, string>)[name]);
}

/** Global error handler — translates AppError (and unexpected errors) into JSON. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
};
