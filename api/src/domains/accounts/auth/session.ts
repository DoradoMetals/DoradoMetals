import { auth } from '#accounts/auth/client.ts'
import { sessionVerdict, sessionRole } from '#accounts/auth/rules.ts'
import * as authSessions from '#db/auth/sessions/repo.ts'

// Ruling 90: a ban, a session revocation and a role change bite at once, and
// the five-minute cookie cache stays. better-auth 1.6.9 answers getSession
// from the signed session-data COOKIE when that cache is on, with no database
// read at all, and nothing on the server can reach into a browser to expire
// it - `revokeSession` deletes the row the cookie is no longer consulting.
// So immediacy has to come from a server-side fact: one indexed read of the
// session's own row, joined to its user, on every authenticated request. The
// cache still earns its keep - it saves better-auth's own token verification
// and session/user lookup - and this adds a single primary-key seek.
//
// `sessions` is a plain object rather than a bare exported function because
// the test harness patches `current`, and an ES module export cannot be
// reassigned.
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
