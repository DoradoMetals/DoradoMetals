import { test } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import { anonymousUsers } from '#db'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import query from '#shared/db/query.ts'

async function aVisitor(c: PoolClient, tag: string): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO auth.users (name, email, "emailVerified", "isAnonymous", role,
                             "createdAt", "updatedAt")
     VALUES ($1, $2, false, true, 'user', $3, $3) RETURNING id`,
    [`visitor ${tag}`, `visitor-${tag}@anonymous.dorado.invalid`, new Date('1999-01-01T00:00:00Z')],
    c
  )
  return rows[0]!.id
}

test('a visitor who reached a payment intent is never a candidate, and blocks nobody', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const blocker = await aVisitor(c, `blocker-${Date.now()}`)
      const innocent = await aVisitor(c, `innocent-${Date.now()}`)
      await query(
        `INSERT INTO payments.intents (user_id, type, status, amount_expected)
       VALUES ($1, 'sales_order_checkout', 'requires_payment_method', 10)`,
        [blocker],
        c
      )

      const stale = await anonymousUsers.listStale(new Date(), 5000, c)
      const ids = stale.map((v) => v.id)
      assert.ok(!ids.includes(blocker), 'a visitor with a payment intent was offered for deletion')
      assert.ok(ids.includes(innocent), 'the innocent visitor was not a candidate')

      const deleted = await anonymousUsers.remove([blocker, innocent], c)
      assert.deepEqual(
        deleted,
        [innocent],
        'one un-deletable visitor took the whole batch down with it - the delete is ' +
          'a single statement, so nobody was deleted and the sweep never made progress again'
      )

      const { rows } = await query<{ n: number }>(
        `SELECT count(*)::int n FROM auth.users WHERE id = $1`,
        [blocker],
        c
      )
      assert.equal(rows[0]!.n, 1, "the blocker's row was deleted, and its intent with it")
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.USERS, LOCKS.ORDERS] }
  )
})

test('every table that references a visitor keeps them out of the sweep', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const withImage = await aVisitor(c, `img-${Date.now()}`)
      await query(
        `INSERT INTO media.images (bucket, path, filename, mime_type, user_id)
       VALUES ('test', $1, 'x.png', 'image/png', $2)`,
        [`${withImage}/`, withImage],
        c
      )

      const withLedger = await aVisitor(c, `led-${Date.now()}`)
      await query(
        `INSERT INTO payments.ledger (user_id, type, amount) VALUES ($1, 'Credit', 1)`,
        [withLedger],
        c
      )

      const ids = (await anonymousUsers.listStale(new Date(), 5000, c)).map((v) => v.id)
      assert.ok(!ids.includes(withImage), 'a visitor who uploaded an image was a candidate')
      assert.ok(!ids.includes(withLedger), 'a visitor with a ledger row was a candidate')
      assert.deepEqual(await anonymousUsers.remove([withImage, withLedger], c), [])
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.USERS, LOCKS.ORDERS] }
  )
})

test('a plain stale visitor still goes, with their checkout and address book', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const visitor = await aVisitor(c, `plain-${Date.now()}`)
      await query(
        `INSERT INTO checkout.checkouts (user_id, direction) VALUES ($1, 'sale')`,
        [visitor],
        c
      )

      assert.deepEqual(await anonymousUsers.remove([visitor], c), [visitor])
      const { rows } = await query<{ n: number }>(
        `SELECT count(*)::int n FROM checkout.checkouts WHERE user_id = $1`,
        [visitor],
        c
      )
      assert.equal(rows[0]!.n, 0)
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.USERS, LOCKS.ORDERS] }
  )
})
