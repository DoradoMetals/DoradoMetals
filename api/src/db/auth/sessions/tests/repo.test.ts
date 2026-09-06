import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser } from '#shared/testing/builders/index.ts'
import * as authSessions from '#db/auth/sessions/repo.ts'

const aSession = async (c: PoolClient, user_id: string): Promise<string> => {
  const { rows } = await c.query<{ id: string }>(
    `INSERT INTO auth.sessions ("userId", token, "expiresAt")
     VALUES ($1, gen_random_uuid()::text, now() + interval '7 days')
     RETURNING id`,
    [user_id]
  )
  return rows[0]!.id
}

test('a session row carries the two facts the change flow reads', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const id = await aSession(c, user.id)
      const row = await authSessions.getOne(id, c)

      assert.equal(row?.userId, user.id)
      assert.equal(row?.stepped_up_at, null, 'a new session has not stepped up')
      assert.equal(row?.factor_changed, null, 'and has changed no factor')
      assert.ok(row?.createdAt, 'freshness is measured from this')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('a step-up stamps the session, and a change records which factor moved', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const id = await aSession(c, user.id)

      const stepped = await authSessions.update(
        id,
        { stepped_up_at: new Date().toISOString() },
        c
      )
      assert.ok(stepped?.stepped_up_at, 'without this a step-up could not make a session fresh')

      const changed = await authSessions.update(id, { factor_changed: 'email' }, c)
      assert.equal(changed?.factor_changed, 'email')
      assert.ok(changed?.stepped_up_at, 'the patch touched only the key it named')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})

test('the freshness read still answers ban state and role', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const user = await aUser(c)
      const id = await aSession(c, user.id)
      const fresh = await authSessions.freshnessOf(id, c)
      assert.equal(fresh?.role, 'user')
      assert.equal(await authSessions.freshnessOf('00000000-0000-4000-8000-0000000000fe', c), undefined)
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.USERS }
  )
})
