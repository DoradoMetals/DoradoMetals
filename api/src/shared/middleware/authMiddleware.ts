import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { sessions } from '#accounts/auth/session.ts'
import { fromNodeHeaders } from 'better-auth/node'
import { runWithActor } from '#shared/http/actor.ts'

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  try {
    if (!req.headers) {
      return res.status(400).json({ error: 'Bad Request', message: 'Headers are missing' })
    }

    // Ruling 90: the seam re-reads the session's ban state and role from the
    // database, because the cookie cache answers from a five-minute-old cookie.
    const { session, reason } = await sessions.current(fromNodeHeaders(req.headers))

    if (!session || !session.user) {
      if (reason === 'banned') {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'This account is banned',
        })
      }
      return res.status(401).json({ error: 'Unauthorized' })
    }

    req.user = session.user
    req.sessionId = session.session?.id
    return runWithActor(session.user.id, () => next())
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' })
  }
}

const roleLevels = {
  user: 1,
  verified_user: 2,
  admin: 3,
} as const

type Role = keyof typeof roleLevels

const requireRole = (minimumRole: Role): RequestHandler => {
  if (!roleLevels[minimumRole]) {
    throw new Error(`Unknown role "${minimumRole}"`)
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    await requireAuth(req, res, () => {
      // The DATABASE's role, put here by the seam - not the role the cookie
      // was signed with, so a demotion from admin bites on the next request.
      const userRole = req.user?.role
      const userLevel = userRole && userRole in roleLevels ? roleLevels[userRole as Role] : 0
      const requiredLevel = roleLevels[minimumRole]

      if (userLevel < requiredLevel) {
        return res.status(403).json({
          error: 'Forbidden',
          message: `Access requires at least "${minimumRole}" privileges`,
        })
      }

      next()
    })
  }
}

export const requireUser = requireRole('user')
export const requireVerifiedUser = requireRole('verified_user')
export const requireAdmin = requireRole('admin')
