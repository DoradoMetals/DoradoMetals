import type { NextFunction, Request, RequestHandler, Response } from "express";
import { auth } from "#features/auth/client.ts";
import { fromNodeHeaders } from "better-auth/node";

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  try {
    if (!req.headers) {
      return res
        .status(400)
        .json({ error: "Bad Request", message: "Headers are missing" });
    }

    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session || !session.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    req.user = session.user;
    next();
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// The ladder, and the only names a role may have. `Role` is derived from the
// object rather than declared beside it, so adding a rung cannot leave the type
// behind - and requireRole's argument is checked at compile time instead of
// only by the throw below.
const roleLevels = {
  user: 1,
  verified_user: 2,
  admin: 3,
} as const;

type Role = keyof typeof roleLevels;

const requireRole = (minimumRole: Role): RequestHandler => {
  if (!roleLevels[minimumRole]) {
    throw new Error(`Unknown role "${minimumRole}"`);
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    await requireAuth(req, res, () => {
      // req.user is optional on the Request type - requireAuth has just set it,
      // but the type describes every handler, guarded or not. An unknown role
      // is level 0, which fails every comparison below, so an unrecognised
      // value is refused rather than treated as privileged.
      const userRole = req.user?.role;
      const userLevel =
        userRole && userRole in roleLevels ? roleLevels[userRole as Role] : 0;
      const requiredLevel = roleLevels[minimumRole];

      if (userLevel < requiredLevel) {
        return res.status(403).json({
          error: "Forbidden",
          message: `Access requires at least "${minimumRole}" privileges`,
        });
      }

      next();
    });
  };
};

export const requireUser = requireRole("user");
export const requireVerifiedUser = requireRole("verified_user");
export const requireAdmin = requireRole("admin");
