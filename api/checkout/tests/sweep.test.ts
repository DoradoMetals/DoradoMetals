import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { aCart, aUser, aVisitor, anAddress } from '#shared/testing/builders/index.ts'
import {
  sweepAnonymousVisitors,
  sweepAnonymousVisitorsNow,
  STALE_AFTER_DAYS,
} from '#checkout/sweep.ts'

afterAll(async () => {
  await pool.end()
})

const HERE = [LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS]

const daysLater = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000)

const exists = async (c: PoolClient, sql: string, id: string): Promise<boolean> =>
  (await c.query(sql, [id])).rows.length > 0

test('a stale visitor goes, and takes their checkout, basket and address book', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const visitor = await aVisitor(c)
      const address = await anAddress(c, visitor)
      const cart = await aCart(c, visitor, { direction: 'purchase' }).withLots(2)

      const result = await sweepAnonymousVisitors(null, null, daysLater(STALE_AFTER_DAYS + 1), c)

      assert.ok(result.deleted.includes(visitor.id), 'the visitor was swept')
      assert.equal(await exists(c, `SELECT 1 FROM auth.users WHERE id = $1`, visitor.id), false)
      assert.equal(
        await exists(c, `SELECT 1 FROM checkout.checkouts WHERE id = $1`, cart.id),
        false
      )
      assert.equal(
        await exists(c, `SELECT 1 FROM checkout.items WHERE checkout_id = $1`, cart.id),
        false,
        'the lines went with the session, by cascade'
      )
      assert.equal(
        await exists(c, `SELECT 1 FROM places.user_addresses WHERE user_id = $1`, visitor.id),
        false
      )
      assert.equal(
        await exists(c, `SELECT 1 FROM places.addresses WHERE id = $1`, address.id),
        true
      )
    },
    { actor: TEST_ACTOR.id, lock: HERE }
  )
})

test('a visitor who is still shopping is left alone', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const visitor = await aVisitor(c)
      await aCart(c, visitor, { direction: 'purchase' }).withLots(1)

      const result = await sweepAnonymousVisitors(null, null, null, c)

      assert.ok(!result.deleted.includes(visitor.id), 'a visitor from a moment ago stays')
      assert.equal(await exists(c, `SELECT 1 FROM auth.users WHERE id = $1`, visitor.id), true)
    },
    { actor: TEST_ACTOR.id, lock: HERE }
  )
})

test('a customer is never a candidate, however old their account', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = await aUser(c)
      await aCart(c, customer, { direction: 'purchase' }).withLots(1)

      const result = await sweepAnonymousVisitors(null, null, daysLater(3650), c)

      assert.ok(
        !result.deleted.includes(customer.id),
        'a customer was swept - the isAnonymous guard is gone'
      )
      assert.equal(await exists(c, `SELECT 1 FROM auth.users WHERE id = $1`, customer.id), true)
    },
    { actor: TEST_ACTOR.id, lock: HERE }
  )
})

test("naming a customer's id directly still deletes nothing", async () => {
  const { anonymousUsers } = await import('#db')
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const customer = await aUser(c)
      const removed = await anonymousUsers.remove([customer.id], c)
      assert.deepEqual(removed, [])
      assert.equal(await exists(c, `SELECT 1 FROM auth.users WHERE id = $1`, customer.id), true)
    },
    { actor: TEST_ACTOR.id, lock: HERE }
  )
})

test('an empty sweep is not an error and writes nothing', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const result = await sweepAnonymousVisitors(null, null, new Date(0), c)
      assert.deepEqual(result, { considered: 0, deleted: [] })
    },
    { actor: TEST_ACTOR.id, lock: HERE }
  )
})

test('sweepAnonymousVisitorsNow runs the real sweep in its own transaction', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const visitor = await aVisitor(c)
      await c.query(
        `UPDATE auth.users SET "updatedAt" = now() - interval '30 days' WHERE id = $1`,
        [visitor.id]
      )

      const result = await sweepAnonymousVisitorsNow()

      assert.ok(
        result.deleted.includes(visitor.id),
        'sweepAnonymousVisitorsNow left a stale visitor behind'
      )
      assert.equal(await exists(c, `SELECT 1 FROM auth.users WHERE id = $1`, visitor.id), false)
    },
    { actor: TEST_ACTOR.id, lock: HERE }
  )
})
