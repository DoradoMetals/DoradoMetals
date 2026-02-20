import { Request, Response, NextFunction } from "express";
import { auth } from "@/features/auth/client";
import { fromNodeHeaders } from "better-auth/node";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string;
        role?: string | null;
        [key: string]: any;
      };
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.headers) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Headers are missing",
      });
    }

    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session || !session.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    req.user = session.user;
    next();
  } catch (err) {
    next(err);
  }
}

const roleLevels = {
  user: 1,
  verified_user: 2,
  admin: 3,
} as const;

type Role = keyof typeof roleLevels;

function requireRole(minimumRole: Role) {
  if (!roleLevels[minimumRole]) {
    throw new Error(`Unknown role "${minimumRole}"`);
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    await requireAuth(req, res, () => {
      const userRole = req.user?.role as Role | null | undefined;
      const userLevel = userRole ? (roleLevels[userRole] ?? 0) : 0;
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
}

export const requireUser = requireRole("user");
export const requireVerifiedUser = requireRole("verified_user");
export const requireAdmin = requireRole("admin");
