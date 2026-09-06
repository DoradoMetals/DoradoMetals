import { Forbidden } from '#shared/errors.ts'
import type { User } from '@dorado/contracts'

export const PASSWORD_SESSION_FRESH_SECONDS = 15 * 60

export function assertMaySetPassword(
  isAnonymous: boolean | null | undefined,
  sessionCreatedAt: Date | string | null | undefined,
  now: number
): void {
  if (!sessionCreatedAt) {
    throw new Forbidden('set_password needs a signed-in caller')
  }
  if (isAnonymous) {
    throw new Forbidden('an anonymous visitor cannot be given a password')
  }
  const age = now - new Date(sessionCreatedAt).getTime()
  if (!(age >= 0 && age < PASSWORD_SESSION_FRESH_SECONDS * 1000)) {
    throw new Forbidden(
      `this session is older than ${PASSWORD_SESSION_FRESH_SECONDS / 60} minutes; ` +
        'sign in again before setting a password'
    )
  }
}

type Freshness = Pick<User, 'banned' | 'role'> & { ban_expires: Date | string | null }

// Ruling 90. The five-minute cookie cache stays, so the SIGNED COOKIE is what
// better-auth reads: it cannot be deleted from the server and it carries the
// role and the ban state that were true when it was minted. These two answer
// over the freshness row instead, which is a database fact and therefore
// immediate.
export function sessionVerdict(
  row: Freshness | undefined,
  now: number
): 'revoked' | 'banned' | 'live' {
  if (!row) return 'revoked'
  if (!row.banned) return 'live'
  if (!row.ban_expires) return 'banned'
  // An elapsed ban is not a ban: better-auth's admin plugin clears it at the
  // next sign-in, so reading it as live is the same answer, sooner.
  return new Date(row.ban_expires).getTime() > now ? 'banned' : 'live'
}

export function sessionRole(row: Freshness | undefined): string | null {
  return row?.role ?? null
}
