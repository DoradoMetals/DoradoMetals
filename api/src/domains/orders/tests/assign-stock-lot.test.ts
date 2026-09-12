import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { LOCKS } from '#shared/testing/locks.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { mockSessions, restoreSessions, asAdmin } from '#shared/testing/session.ts'
import { aUser, anOrder } from '#shared/testing/builders/index.ts'
import * as orders from '#orders/service.ts'
import * as orderLots from '#db/orders/lots/repo.ts'
import { Invalid } from '#shared/errors.ts'

await mockSessions()
const { default: app } = await import('#app')

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(),
    0,
    'these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`'
  )
})
afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const anOnHandLot = async (c: PoolClient) => {
  const {
    rows: [metal],
  } = await c.query(`SELECT id FROM metals.metals ORDER BY id LIMIT 1`)
  const {
    rows: [lot],
  } = await c.query(
    `INSERT INTO inventory.lots (metal_id, pre_melt, purity, quantity, unit)
     VALUES ($1, 3, 0.999, 1, 't oz') RETURNING id`,
    [metal.id]
  )
  return lot.id as string
}

test('assigning an on-hand lot to a sale mints a sale lot with a sale edge, and links it', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const buyer = await aUser(c)
      const order = await anOrder(c, buyer, { direction: 'sale' })
      const stockLotId = await anOnHandLot(c)

      const written = await orders.assignStockLot(order.id, stockLotId)
      assert.notEqual(written.lot_id, stockLotId, 'the sale lot is a mint, not the stock lot itself')

      const { rows: edges } = await c.query(
        `SELECT lot_id, source_lot_id, kind FROM inventory.lot_sources WHERE source_lot_id = $1`,
        [stockLotId]
      )
      assert.equal(edges.length, 1, 'no sale edge was written')
      assert.equal(edges[0].kind, 'sale')
      assert.equal(edges[0].lot_id, written.lot_id)

      const { rows: stock } = await c.query(`SELECT pre_melt, purity FROM inventory.lots WHERE id = $1`, [
        stockLotId,
      ])
      const { rows: minted } = await c.query(`SELECT pre_melt, purity FROM inventory.lots WHERE id = $1`, [
        written.lot_id,
      ])
      assert.equal(Number(minted[0].pre_melt), Number(stock[0].pre_melt), 'the mint did not copy the figures')
      assert.equal(Number(minted[0].purity), Number(stock[0].purity))

      const linked = await orderLots.getFor(order.id, c)
      assert.ok(linked.some((row) => row.lot_id === written.lot_id), 'the sale lot was not linked')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('a lot that is not on hand is refused - assigning it to a sale is BLOCKED', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const buyer = await aUser(c)
      const alreadySold = await anOrder(c, buyer, { direction: 'sale' })
      const soldOutLotId = await anOnHandLot(c)
      await orderLots.link(alreadySold.id, soldOutLotId, c)

      const target = await anOrder(c, buyer, { direction: 'sale' })
      await assert.rejects(
        () => orders.assignStockLot(target.id, soldOutLotId),
        (err: unknown) => err instanceof Invalid && /is sold, so it cannot be assigned/.test((err as Error).message)
      )
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('POST /:id/lots mints a sale lot over HTTP when the body names an existing lot', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const buyer = await aUser(c)
      const order = await anOrder(c, buyer, { direction: 'sale' })
      const stockLotId = await anOnHandLot(c)

      await asAdmin(TEST_ACTOR, async () => {
        const res = await request(app)
          .post(`/api/orders/${order.id}/lots`)
          .send({ lot_id: stockLotId })
        assert.equal(res.status, 201, `answered ${res.status}: ${JSON.stringify(res.body)}`)
        assert.notEqual(res.body.lot_id, stockLotId)
        assert.equal(res.body.order_id, order.id)
      })
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})
