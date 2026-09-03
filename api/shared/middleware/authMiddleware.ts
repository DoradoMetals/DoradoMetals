import type { NextFunction, Request, RequestHandler, Response } from "express";
import { auth } from "#domain/auth/client.ts";
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

// The ladder and the only names a role may have — Role is derived from this object, so a new rung can't be added without the type following.
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
      // An unknown role resolves to level 0, failing every comparison — an unrecognised value is refused, never treated as privileged.
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
