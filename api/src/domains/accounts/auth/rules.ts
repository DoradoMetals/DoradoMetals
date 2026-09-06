import { Forbidden } from '#shared/errors.ts'

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
