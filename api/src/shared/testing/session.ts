import { auth } from '#accounts/auth/client.ts'

type TestUser = {
  id: string
  role?: string | null
  email?: string | null
  name?: string | null
  session_id?: string
  [extra: string]: unknown
}
type TestSession = {
  user: { id: string; role: string; email: string | null; name: string | null }
  session: { id: string; userId: string }
} | null

let current: TestSession = null
let real: ((...args: unknown[]) => unknown) | null = null

export async function mockSessions() {
  if (real) return
  real = auth.api.getSession.bind(auth.api) as (...args: unknown[]) => unknown
  ;(auth.api as Record<string, unknown>).getSession = async () => current
}

export function restoreSessions() {
  if (!real) return
  ;(auth.api as Record<string, unknown>).getSession = real
  real = null
}

export async function as<T>(
  user: TestUser | null,
  fn: () => Promise<T> | T,
  role?: string
): Promise<T> {
  const previous = current
  current = user
    ? {
        user: {
          ...user,
          id: user.id,
          role: role ?? user.role ?? 'user',
          email: user.email ?? null,
          name: user.name ?? null,
        },
        session: { id: user.session_id ?? '00000000-0000-0000-0000-000000000000', userId: user.id },
      }
    : null
  try {
    return await fn()
  } finally {
    current = previous
  }
}

export const anonymous = <T>(fn: () => Promise<T> | T): Promise<T> => as(null, fn)

export const asAdmin = <T>(user: TestUser, fn: () => Promise<T> | T): Promise<T> =>
  as(user, fn, 'admin')
export const asUser = <T>(user: TestUser, fn: () => Promise<T> | T): Promise<T> =>
  as(user, fn, 'user')
