import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anOrder } from '#shared/testing/builders/index.ts'
import * as lots from '#db/inventory/lots/repo.ts'
import * as rules from '#refining/rules.ts'
import { Conflict } from '#shared/errors.ts'
import { RefiningOrderCreate } from '@dorado/contracts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const inRefining = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS })

async function freshRefiner(c: PoolClient): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    'SELECT id FROM refiners.refiners ORDER BY id LIMIT 1'
  )
  assert.ok(rows[0], 'the test database has no refiner')
  await c.query(
    `UPDATE refining.orders SET cancelled_at = now()
      WHERE refiner_id = $1 AND direction = 'sell' AND sent_at IS NULL AND cancelled_at IS NULL`,
    [rows[0].id]
  )
  return rows[0].id
}

const create = (body: object) => request(app).post('/api/refining/orders').send(body)

test('the create contract refuses lot_ids on a buy (ruling 159)', () => {
  const refiner_id = TEST_ACTOR.id
  const lot_ids = [TEST_ACTOR.id]
  assert.equal(RefiningOrderCreate.safeParse({ refiner_id, direction: 'buy' }).success, true)
  assert.equal(
    RefiningOrderCreate.safeParse({ refiner_id, direction: 'sell', lot_ids }).success,
    true
  )
  assert.equal(RefiningOrderCreate.safeParse({ refiner_id, direction: 'sell' }).success, true)
})

test('a Refiner Purchase is created with no lots and refuses any it is sent', async () => {
  await inRefining(async (c) => {
    await asAdmin(TEST_ACTOR, async () => {
      const refiner_id = await freshRefiner(c)
      const onHand = await lots.create({ metal_id: 'Gold', pre_melt: 5, purity: 0.9 }, c)

      const bare = await create({ refiner_id, direction: 'buy', settlement_type: 'pooled' })
      assert.equal(bare.status, 201, bare.text)
      assert.equal(bare.body.direction, 'buy')
      assert.equal(bare.body.lots.length, 0)

      const refused = await create({ refiner_id, direction: 'buy', lot_ids: [onHand.id] })
      assert.equal(refused.status, 422, refused.text)
      assert.match(refused.body?.error?.message ?? '', /purchase|buy/i)
      assert.match(refused.body?.error?.message ?? '', /lot/i)
    })
  })
})

test('the buy refusal is a named error raised in rules.ts', () => {
  assert.equal(typeof rules.assertBuyTakesNoLots, 'function')
  assert.doesNotThrow(() => rules.assertBuyTakesNoLots('buy', undefined))
  assert.doesNotThrow(() => rules.assertBuyTakesNoLots('sell', [TEST_ACTOR.id]))
  assert.throws(
    () => rules.assertBuyTakesNoLots('buy', [TEST_ACTOR.id]),
    (err: unknown) =>
      err instanceof rules.RefinerPurchaseTakesNoLots && err.name === 'RefinerPurchaseTakesNoLots'
  )
})

test('a Refiner Sale takes only on-hand lots, and may be created empty', async () => {
  await inRefining(async (c) => {
    await asAdmin(TEST_ACTOR, async () => {
      const refiner_id = await freshRefiner(c)
      const sold = await anOrder(c, await aUser(c), { direction: 'sale' }).withLots(1)

      const notOnHand = await create({
        refiner_id,
        direction: 'sell',
        lot_ids: [sold.lots[0]!.lot_id],
      })
      assert.equal(notOnHand.status, 422, notOnHand.text)
      assert.match(notOnHand.body?.error?.message ?? '', /not on hand/)

      const onHand = await lots.create({ metal_id: 'Gold', pre_melt: 5, purity: 0.9 }, c)
      const made = await create({ refiner_id, direction: 'sell', lot_ids: [onHand.id] })
      assert.equal(made.status, 201, made.text)
      assert.equal(made.body.lots.length, 1)
    })
  })
})

test('a second open Refiner Sale for one refiner is a named Conflict that reaches the client as 409', async () => {
  await inRefining(async (c) => {
    await asAdmin(TEST_ACTOR, async () => {
      const refiner_id = await freshRefiner(c)
      const first = await create({ refiner_id, direction: 'sell' })
      assert.equal(first.status, 201, first.text)

      const second = await create({ refiner_id, direction: 'sell' })
      assert.equal(second.status, 409, second.text)
      assert.match(second.body?.error?.message ?? '', new RegExp(String(first.body.number)))

      const buy = await create({ refiner_id, direction: 'buy' })
      assert.equal(buy.status, 201, 'only sell orders are one per refiner')
    })
  })
})

test('the open-sale conflict is a named class extending Conflict', () => {
  const open = { number: 2493 } as Parameters<typeof rules.assertNoOpenSellOrder>[0]
  assert.throws(
    () => rules.assertNoOpenSellOrder(open),
    (err: unknown) =>
      err instanceof rules.RefinerSaleOpen &&
      err instanceof Conflict &&
      err.name === 'RefinerSaleOpen' &&
      /2493/.test((err as Error).message)
  )
})
