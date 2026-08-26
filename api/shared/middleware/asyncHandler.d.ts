import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Types the wrapper every controller goes through, so that converting a
 * controller means something.
 *
 * WITHOUT THIS, A CONVERTED CONTROLLER GAINS ALMOST NOTHING. asyncHandler is
 * JavaScript, so `fn` infers as `any` and `req`/`res` arrive contextually typed
 * as `any` - no error, no checking, and `req.user.id` on a route with no guard
 * in front of it reads exactly like one that has.
 *
 * `req.user` is declared OPTIONAL in the augmentation below, which is the whole
 * point: requireUser sets it, and nothing else does. A controller that reads it
 * without a guard is then a compile error rather than a 500 discovered by a
 * customer - the same class as the eight unguarded reads the service
 * conversions turned up.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => unknown | Promise<unknown>
): RequestHandler;
