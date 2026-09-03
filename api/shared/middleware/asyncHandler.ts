import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Wraps an async handler so a thrown/rejected error reaches the central errorHandler, instead of every controller repeating try/catch/next.
 * Fully typed on purpose — an untyped wrapper would let req.user.id compile on a route with no guard in front of it, since req.user is declared OPTIONAL (only requireUser sets it) — this makes that a compile error instead of a 500 a customer discovers.
 */
export const asyncHandler =
  (
    fn: (req: Request, res: Response, next: NextFunction) => unknown | Promise<unknown>
  ): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
