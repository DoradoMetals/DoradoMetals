import type { BetterAuthOptions } from 'better-auth'

const DAY = 60 * 60 * 24

// A session lasts 30 days and is pushed forward at most once a day on use.
// The cookie cache stays five minutes (ruling 90); it saves a read and never
// decides expiry, and the session seam still reads the row on every request.
export const sessionLifetime: NonNullable<BetterAuthOptions['session']> = {
  expiresIn: 30 * DAY,
  updateAge: DAY,
  cookieCache: { enabled: true, maxAge: 5 * 60 },
}
