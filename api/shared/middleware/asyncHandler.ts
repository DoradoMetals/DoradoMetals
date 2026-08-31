import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Wraps an async route handler so any thrown/rejected error is forwarded to the
 * central errorHandler, instead of every controller repeating try/catch/next.
 *
 * `fn` is fully typed so that converting a controller means something: with an
 * untyped wrapper, `req`/`res` arrive contextually typed as `any` - no error,
 * no checking, and `req.user.id` on a route with no guard in front of it reads
 * exactly like one that has.
 *
 * `req.user` is declared OPTIONAL in the augmentation (shared/types/express.d.ts),
 * which is the whole point: requireUser sets it, and nothing else does. A
 * controller that reads it without a guard is then a compile error rather than
 * a 500 discovered by a customer.
 */
export const asyncHandler =
  (
    fn: (req: Request, res: Response, next: NextFunction) => unknown | Promise<unknown>
  ): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
