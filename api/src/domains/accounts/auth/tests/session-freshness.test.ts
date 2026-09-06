import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anAdmin } from '#shared/testing/builders/index.ts'
import { auth } from '#accounts/auth/client.ts'
import { sessions } from '#accounts/auth/session.ts'

// A row of auth.sessions, minted by the database - the id is never invented here.
const aSession = async (c: PoolClient, user_id: string): Promise<string> => {
  const { rows } = await c.query<{ id: string }>(
    `INSERT INTO auth.sessions ("userId", token, "expiresAt")
     VALUES ($1, gen_random_uuid()::text, $2)
     RETURNING id`,
    [user_id, hoursAway(24 * 7)]
  )
  return rows[0]!.id
}

// `banExpires` is `timestamp without time zone`, and better-auth writes it as a
// JS Date through pg - so the stored wall clock is the API server's, which runs
// TZ=UTC. Writing it here with Postgres's own `now()` would store the DATABASE
// session's wall clock instead (this cluster's is America/Chicago), which is
// five hours off and not what any ban in production looks like.
const hoursAway = (h: number): Date => new Date(Date.now() + h * 3_600_000)

// What better-auth answers out of the SIGNED COOKIE: a payload minted when the
// session began, with no database read behind it. A fresh object each call,
// because the seam writes the database's role onto it.
const cookieSaid = (user_id: string, session_id: string, role: string) => () => ({
  user: { id: user_id, role },
  session: { id: session_id, userId: user_id },
})

const asCached = async <T>(payload: unknown, fn: () => Promise<T>): Promise<T> => {
  const real = auth.api.getSession
  ;(auth.api as Record<string, unknown>).getSession = async () => payload
  try {
    return await fn()
  } finally {
    ;(auth.api as Record<string, unknown>).getSession = real
  }
}

const answerFor = (payload: unknown) => asCached(payload, () => sessions.current(new Headers()))

test('a revoked session is refused on the very next call, not in five minutes', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const session_id = await aSession(c, user.id)
      const cookie = cookieSaid(user.id, session_id, 'user')

      const before = await answerFor(cookie())
      assert.equal(before.reason, null, 'a session whose row is present is live')
      assert.equal(before.session?.user.id, user.id)

      await c.query('DELETE FROM auth.sessions WHERE id = $1', [session_id])

      const after = await answerFor(cookie())
      assert.equal(
        after.reason,
        'revoked',
        'the cookie still parses - the freshness read is the only thing that ' +
          'sees the row is gone, and it must see it at once'
      )
      assert.equal(after.session, null, 'a revoked session must carry no user')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('a ban bites at once, and a ban that has elapsed does not bite at all', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const session_id = await aSession(c, user.id)
      const cookie = cookieSaid(user.id, session_id, 'user')

      assert.equal((await answerFor(cookie())).reason, null, 'the user starts unbanned')

      await c.query('UPDATE auth.users SET banned = true WHERE id = $1', [user.id])
      assert.equal(
        (await answerFor(cookie())).reason,
        'banned',
        'the admin plugin only checks `banned` when a session is CREATED, so ' +
          'nothing but this read refuses a banned user mid-session'
      )

      await c.query('UPDATE auth.users SET "banExpires" = $2 WHERE id = $1', [
        user.id,
        hoursAway(-1),
      ])
      assert.equal(
        (await answerFor(cookie())).reason,
        null,
        'a ban whose expiry has passed is not a ban'
      )

      await c.query('UPDATE auth.users SET "banExpires" = $2 WHERE id = $1', [
        user.id,
        hoursAway(1),
      ])
      assert.equal((await answerFor(cookie())).reason, 'banned', 'a ban still running is a ban')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('a demotion from admin is on the session the next call answers', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await anAdmin(c)
      const session_id = await aSession(c, user.id)
      // The cookie was signed while this user WAS an admin, and says so.
      const cookie = cookieSaid(user.id, session_id, 'admin')

      assert.equal((await answerFor(cookie())).session?.user.role, 'admin')

      await c.query(`UPDATE auth.users SET role = 'user' WHERE id = $1`, [user.id])

      assert.equal(
        (await answerFor(cookie())).session?.user.role,
        'user',
        'requireRole reads req.user.role, so a cookie that still says admin ' +
          'would keep the admin surface open for five minutes'
      )
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})
