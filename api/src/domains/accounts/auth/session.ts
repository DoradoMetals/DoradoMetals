import { auth } from '#accounts/auth/client.ts'
import { sessionVerdict, sessionRole } from '#accounts/auth/rules.ts'
import * as authSessions from '#db/auth/sessions/repo.ts'

export const sessions = {
  current: async (headers: Headers) => {
    const cached = await auth.api.getSession({ headers })
    if (!cached?.user || !cached.session) return { session: null, reason: 'unauthenticated' }

    const fresh = await authSessions.freshnessOf(cached.session.id)
    const verdict = sessionVerdict(fresh, Date.now())
    if (verdict !== 'live') return { session: null, reason: verdict }

    cached.user.role = sessionRole(fresh)
    return { session: cached, reason: null }
  },
}
