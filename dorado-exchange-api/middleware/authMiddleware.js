import { auth } from "../auth.js";
import { fromNodeHeaders } from "better-auth/node";

export const requireAuth = async (req, res, next) => {
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

const roleLevels = {
  user: 1,
  verified_user: 2,
  admin: 3,
};

const requireRole = (minimumRole) => {
  if (!roleLevels[minimumRole]) {
    throw new Error(`Unknown role "${minimumRole}"`);
  }

  return async (req, res, next) => {
    await requireAuth(req, res, () => {
      const userRole = req.user.role;
      const userLevel = roleLevels[userRole] || 0;
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
