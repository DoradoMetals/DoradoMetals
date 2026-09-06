import { sessions } from '#accounts/auth/session.ts'

type TestUser = {
  id: string
  role?: string | null
  email?: string | null
  name?: string | null
  session_id?: string
  session_created_at?: string | null
  stepped_up_at?: string | null
  factor_changed?: 'email' | 'phone' | null
  [extra: string]: unknown
}
type TestSession = {
  user: { id: string; role: string; email: string | null; name: string | null }
  session: {
    id: string
    userId: string
    createdAt: string
    stepped_up_at: string | null
    factor_changed: 'email' | 'phone' | null
  }
} | null

let current: TestSession = null
let real: ((...args: unknown[]) => unknown) | null = null

// Ruling 90 moved the middleware off `auth.api.getSession` and onto the
// session seam, which reads ban state and role from the database on every
// request. Patching the seam is what keeps these tests off that read; the
// public surface below is unchanged.
export async function mockSessions() {
  if (real) return
  real = sessions.current as (...args: unknown[]) => unknown
  ;(sessions as Record<string, unknown>).current = async () => ({
    session: current,
    reason: current ? null : 'unauthenticated',
  })
}

export function restoreSessions() {
  if (!real) return
  ;(sessions as Record<string, unknown>).current = real
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
        session: {
          id: user.session_id ?? '00000000-0000-0000-0000-000000000000',
          userId: user.id,
          // Freshness and one-factor-per-session are session facts, so the mock
          // carries them. A caller that names none gets a session minted now,
          // which is what every existing caller assumed.
          createdAt: user.session_created_at ?? new Date().toISOString(),
          stepped_up_at: user.stepped_up_at ?? null,
          factor_changed: user.factor_changed ?? null,
        },
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
