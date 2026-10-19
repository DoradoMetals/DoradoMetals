export type SessionSnapshot = {
  user?: { role?: string | null } | null
  error?: { status?: number } | null
  isPending: boolean
}

// 'out' is the only verdict that may send a visitor to sign-in: the session
// answered and there is no user, or the server said 401. A failed fetch (the
// network after a tab was backgrounded, a 5xx) is 'unknown': keep what is on
// screen and ask again.
export type SessionVerdict = 'pending' | 'in' | 'out' | 'unknown'

export function sessionVerdict({ user, error, isPending }: SessionSnapshot): SessionVerdict {
  if (user) return 'in'
  if (isPending) return 'pending'
  if (error && error.status !== 401 && error.status !== 403) return 'unknown'
  return 'out'
}
