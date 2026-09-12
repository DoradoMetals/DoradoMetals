import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import query from '#shared/db/query.ts'
import { inRollback } from '#shared/testing/rollback.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser } from '#shared/testing/builders/index.ts'
import * as inbound from '#db/payments/inbound/repo.ts'

beforeAll(() => {
  assert.equal(new Date().getTimezoneOffset(), 0, 'these tests require TZ=UTC')
})
afterAll(async () => {
  await pool.end()
})

async function aSale(c: PoolClient, user_id: string, owed: number): Promise<[string, number]> {
  const { rows } = await query<{ id: string; number: number }>(
    `INSERT INTO orders.orders (direction, number, user_id)
     VALUES ('sale', nextval('orders.sale_number_seq'), $1) RETURNING id, number`,
    [user_id],
    c
  )
  const row = rows[0]!
  await query(
    `INSERT INTO orders.transactions (order_id, total, post_charges_amount) VALUES ($1, $2, $2)`,
    [row.id, owed],
    c
  )
  return [row.id, row.number]
}

const movement = (
  external_id: string,
  amount: number,
  memo: string,
  who: string | null,
  account_ref: string | null = null
) => ({
  source: 'plaid' as const,
  external_id,
  amount,
  occurred_at: '2026-09-05T12:00:00.000Z',
  counterparty_name: who,
  memo,
  account_ref,
})

test('the same feed row twice is one inbound transaction', async () => {
  await inRollback(async (c) => {
    const first = await inbound.create(movement('txn-a', 500, 'WIRE IN', null), c)
    assert.ok(first)
    const again = await inbound.create(movement('txn-a', 500, 'WIRE IN', null), c)
    assert.equal(again?.id, first.id)
    assert.equal((await inbound.findByExternal('plaid', 'txn-a', c))?.id, first.id)
  })
})

test('the ladder ranks a memo reference above a lucky amount', async () => {
  await inRollback(
    async (c) => {
      const user = await aUser(c, { name: 'Ada Lovelace' })
      const [order, number] = await aSale(c, user.id, 500)

      await inbound.create(movement('txn-ref', 999, `ACH CREDIT SO-${number}`, 'Someone Else'), c)
      await inbound.create(movement('txn-heur', 500.25, 'ACH CREDIT', 'Ada Lovelace'), c)
      await inbound.create(movement('txn-none', 12, 'COFFEE', null), c)

      const candidates = await inbound.candidates(order, null, c)
      const byId = candidates.map((row) => row.rung)
      assert.equal(candidates[0]?.rung, 'reference')
      assert.ok(byId.includes('heuristic'), `no heuristic rung in ${byId.join(', ')}`)
      assert.ok(byId.includes('manual'), `no manual rung in ${byId.join(', ')}`)
    },
    { lock: LOCKS.ORDERS }
  )
})

test('the heuristic rung holds inside fifty cents and falls back outside it', async () => {
  await inRollback(
    async (c) => {
      const user = await aUser(c, { name: 'Grace Hopper' })
      const [order] = await aSale(c, user.id, 500)

      await inbound.create(movement('txn-in', 500.5, 'ACH', 'Grace Hopper'), c)
      await inbound.create(movement('txn-out', 501.5, 'ACH', 'Grace Hopper'), c)

      const candidates = await inbound.candidates(order, null, c)
      const inside = candidates.find((row) => Number(row.amount) === 500.5)
      const outside = candidates.find((row) => Number(row.amount) === 501.5)
      assert.equal(inside?.rung, 'heuristic')
      assert.equal(outside?.rung, 'manual')
    },
    { lock: LOCKS.ORDERS }
  )
})

test('the account rung matches an exact virtual account reference', async () => {
  await inRollback(
    async (c) => {
      const user = await aUser(c)
      const [order] = await aSale(c, user.id, 500)
      await inbound.create(movement('txn-va', 1, 'nothing else matches', null, 'va-0001'), c)

      const candidates = await inbound.candidates(order, 'va-0001', c)
      assert.equal(candidates[0]?.rung, 'account')
    },
    { lock: LOCKS.ORDERS }
  )
})

test('a matched row leaves the unmatched list', async () => {
  await inRollback(
    async (c) => {
      const user = await aUser(c)
      const [order] = await aSale(c, user.id, 500)
      const row = await inbound.create(movement('txn-match', 500, 'ACH', null), c)
      assert.ok(row)

      await inbound.update(row.id, { state: 'Matched', order_id: order }, c)
      const unmatched = await inbound.listUnmatched(c)
      assert.equal(
        unmatched.some((r) => r.id === row.id),
        false
      )
      assert.equal((await inbound.candidates(order, null, c)).some((r) => r.id === row.id), false)
    },
    { lock: LOCKS.ORDERS }
  )
})
