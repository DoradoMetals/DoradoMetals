import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, asAdmin, asUser } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction, outside } from '#shared/testing/pinned-pool.ts'
import {
  aUser,
  anAddress,
  aProduct,
  anOrder,
  aRefiningOrder,
  aPayout,
  carrierServiceId,
  packageId,
} from '#shared/testing/builders/index.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import type { PoolClient } from 'pg'

const ORDER_LOCK = LOCKS.ORDERS

await mockSessions()
const { default: app } = await import('#app')

type UserFixture = { id: string; name: string | null; email: string | null }

const admin: UserFixture = TEST_ACTOR

const anOpenPurchaseOrder = async (c: PoolClient) => {
  const owner = await aUser(c, { name: 'The Customer' })
  const address = await anAddress(c, owner)
  const product = await aProduct(c)
  const built = await anOrder(c, owner, { direction: 'purchase' })
    .withBullion(product, 1)
    .withLots(1, { metal_id: 'Gold' })
    .withSpots()
    .withAddress(address)
    .withFulfillment()
    .withTotals({ total: 1000, payout_fee: 0 })
  await aRefiningOrder(c, built)
  await aPayout(c, owner, { order: built })
  return {
    order: { id: built.id, user_id: owner.id },
    owner,
  }
}

const anAddresslessPurchaseOrder = async (c: PoolClient) => {
  const owner = await aUser(c)
  const built = await anOrder(c, owner, { direction: 'purchase' })
    .withLots(1)
    .withSpots()
    .withTotals({ total: 1000 })
  return { id: built.id }
}

const label = async (c: PoolClient) => ({
  service: { id: await carrierServiceId(c, 'Express Saver') },
  box: { id: await packageId(c, 'Small Box') },
})

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

test("the PATCH takes the order row's own fields, and refuses everything else", async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { order } = await anOpenPurchaseOrder(c)
      await asAdmin(admin, async () => {
        for (const named of ['add_funds', 'finalize', 'cancel', 'supplier']) {
          const res = await request(app)
            .patch(`/api/orders/${order.id}`)
            .send({ [named]: true })
          assert.equal(res.status, 400, `${named} was not refused`)
          assert.match(
            res.body?.error?.message ?? '',
            new RegExp(named),
            `the refusal does not name ${named}`
          )
        }

        for (const named of [
          'order_spots',
          'purchase_order',
          'spots',
          'items',
          'charges',
          'pool_oz_deducted',
          'tracking',
          'refiner',
        ]) {
          const res = await request(app)
            .patch(`/api/orders/${order.id}`)
            .send({ [named]: 1 })
          assert.equal(res.status, 400, `${named} was not refused`)
          assert.match(res.body?.error?.message ?? '', new RegExp(named))
        }

        const empty = await request(app).patch(`/api/orders/${order.id}`).send({})
        assert.equal(empty.status, 422, `answered ${empty.status}`)
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('an action of the wrong direction is refused, naming the direction', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { order } = await anOpenPurchaseOrder(c)
      const sale = await anOrder(c, await aUser(c), { direction: 'sale' }).withLots(1)
      await asAdmin(admin, async () => {
        const res = await request(app).post(`/api/orders/${sale.id}/finalize`).send({})
        assert.equal(res.status, 422, `answered ${res.status}`)
        assert.match(
          res.body?.error?.message ?? '',
          /this is not a purchase order/
        )

        const refiner = await request(app)
          .post(`/api/orders/${order.id}/supply`)
          .send({ refiner_id: '00000000-0000-4000-8000-000000000000' })
        assert.equal(refiner.status, 422, `answered ${refiner.status}`)
        assert.match(
          refiner.body?.error?.message ?? '',
          /sale-direction operation and this is a purchase order/
        )
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('a customer is refused outright, their own order included', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const { order, owner } = await anOpenPurchaseOrder(client)
      await asUser(owner, async () => {
        const before = (
          await client.query(
            `SELECT o.cancelled_at, t.total FROM orders.orders o
             JOIN orders.transactions t ON t.order_id = o.id WHERE o.id = $1`,
            [order.id]
          )
        ).rows[0]

        const label = await request(app)
          .patch(`/api/orders/${order.id}`)
          .send({ notes: 'a note the owner should not be able to write' })
        assert.equal(label.status, 403, 'the owner reached the patch endpoint')

        for (const action of ['add_funds', 'finalize', 'cancel', 'supply']) {
          const res = await request(app).post(`/api/orders/${order.id}/${action}`).send({})
          assert.equal(res.status, 403, `the owner reached ${action}`)
        }
        const spots = await request(app).put(`/api/orders/${order.id}/spots`).send({ lock: true })
        assert.equal(spots.status, 403, 'the owner reached the spots PUT')
        const item = await request(app)
          .post(`/api/orders/${order.id}/lots`)
          .send({ bullion_id: '00000000-0000-4000-8000-000000000000' })
        assert.equal(item.status, 403, 'the owner reached line creation')

        const after = (
          await client.query(
            `SELECT o.cancelled_at, t.total FROM orders.orders o
             JOIN orders.transactions t ON t.order_id = o.id WHERE o.id = $1`,
            [order.id]
          )
        ).rows[0]
        assert.deepEqual(after, before, 'a refused caller still wrote')
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('a notes write moves the note and NOTHING else', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const { order } = await anOpenPurchaseOrder(client)
      await asAdmin(admin, async () => {
        const moneyBefore = (
          await client.query(
            `SELECT t.total, o.spots_locked FROM orders.orders o
             JOIN orders.transactions t ON t.order_id = o.id WHERE o.id = $1`,
            [order.id]
          )
        ).rows[0]
        const pricesBefore = (
          await client.query(
            `SELECT ol.id, li.premium, li.content FROM orders.lots ol
               JOIN inventory.lots li ON li.id = ol.lot_id
              WHERE ol.order_id = $1 ORDER BY ol.id`,
            [order.id]
          )
        ).rows

        const res = await request(app)
          .patch(`/api/orders/${order.id}`)
          .send({ notes: 'left at the front desk' })
        assert.equal(res.status, 200, `answered ${res.status}: ${JSON.stringify(res.body)}`)

        const row = (
          await client.query(
            `SELECT o.notes, t.total, o.spots_locked, o.updated_by
             FROM orders.orders o
             JOIN orders.transactions t ON t.order_id = o.id WHERE o.id = $1`,
            [order.id]
          )
        ).rows[0]
        assert.equal(row.notes, 'left at the front desk')
        assert.equal(row.updated_by, admin.name, 'the audit name did not come from the session')

        assert.deepEqual(
          { total: row.total, spots_locked: row.spots_locked },
          moneyBefore,
          'a bare notes write moved money or the spot pin'
        )
        const pricesAfter = (
          await client.query(
            `SELECT ol.id, li.premium, li.content FROM orders.lots ol
               JOIN inventory.lots li ON li.id = ol.lot_id
              WHERE ol.order_id = $1 ORDER BY ol.id`,
            [order.id]
          )
        ).rows
        assert.deepEqual(pricesAfter, pricesBefore, 'a bare notes write re-priced the lines')
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('the cancel action reaches the label pipeline, and a label failure leaves the cancellation standing', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const { service, box } = await label(client)
      const { order: returnable } = await anOpenPurchaseOrder(client)
      await asAdmin(admin, async () => {
        const res = await request(app).post(`/api/orders/${returnable.id}/cancel`).send({
          carrier_service_id: service.id,
          package_id: box.id,
        })

        assert.equal(
          res.status,
          500,
          `expected the label guard's 500, got ${res.status}: ${JSON.stringify(res.body)}`
        )

        const { rows } = await client.query(
          `SELECT cancelled_at FROM orders.orders WHERE id = $1`,
          [returnable.id]
        )
        assert.ok(
          rows[0].cancelled_at,
          'the DB write commits before the carrier is asked, so a label failure must not undo it'
        )
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('an order with no address snapshot refuses the cancel before the carrier', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { service, box } = await label(c)
      const orphan = await anAddresslessPurchaseOrder(c)
      await asAdmin(admin, async () => {
        const res = await request(app).post(`/api/orders/${orphan.id}/cancel`).send({
          carrier_service_id: service.id,
          package_id: box.id,
        })
        assert.equal(res.status, 422, `answered ${res.status}`)
        assert.match(res.body?.error?.message ?? '', /no address snapshot/)
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('an unknown field is refused over HTTP and executes nothing beside it', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const { order } = await anOpenPurchaseOrder(client)
      await asAdmin(admin, async () => {
        const before = (
          await client.query(`SELECT notes FROM orders.orders WHERE id = $1`, [order.id])
        ).rows[0]

        const res = await request(app)
          .patch(`/api/orders/${order.id}`)
          .send({ notes: 'should not land', order_spots: [] })

        assert.equal(res.status, 400, `answered ${res.status}`)
        assert.match(res.body?.error?.message ?? '', /"order_spots"/)

        const after = (
          await client.query(`SELECT notes FROM orders.orders WHERE id = $1`, [order.id])
        ).rows[0]
        assert.deepEqual(after, before, 'the valid half of a refused document was executed')
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('a nonexistent order answers 404 to an admin', async () => {
  await inPinnedTransaction(
    async () => {
      await asAdmin(admin, async () => {
        const res = await request(app)
          .patch('/api/orders/00000000-0000-4000-8000-000000000000')
          .send({ notes: 'anything' })
        assert.equal(res.status, 404, `answered ${res.status}`)
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

const PINNED_BIDS: Record<string, number> = {
  Gold: 2000,
  Silver: 25,
  Platinum: 900,
  Palladium: 800,
}

const pinMetals = async (client: PoolClient) => {
  for (const [metal, bid] of Object.entries(PINNED_BIDS)) {
    await client.query(
      `UPDATE spots.spots SET bid = $1
        WHERE metal_id = $2`,
      [bid, metal]
    )
  }
}

const snapshot = async (client: PoolClient, id: string) => ({
  order: (
    await client.query(
      `SELECT o.notes, o.spots_locked, t.total
         FROM orders.orders o
         JOIN orders.transactions t ON t.order_id = o.id WHERE o.id = $1`,
      [id]
    )
  ).rows[0],
  metals: (
    await client.query(
      `SELECT sp.metal_id, sp.bid FROM orders.spots sp
        WHERE sp.order_id = $1 ORDER BY sp.metal_id`,
      [id]
    )
  ).rows,
  items: (
    await client.query(
      `SELECT ol.id, li.premium, li.content FROM orders.lots ol
         JOIN inventory.lots li ON li.id = ol.lot_id
        WHERE ol.order_id = $1 ORDER BY ol.id`,
      [id]
    )
  ).rows,
})

type Snapshot = Awaited<ReturnType<typeof snapshot>>

test('finalizing prices the order and pins its spots; the label that follows moves nothing', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const { order } = await anOpenPurchaseOrder(client)
      await pinMetals(client)
      await client.query(
        `UPDATE inventory.lots li SET confirmed_at = now()
           FROM orders.lots ol WHERE ol.lot_id = li.id AND ol.order_id = $1`,
        [order.id]
      )
      await asAdmin(admin, async () => {
        const finalize = await request(app)
          .post(`/api/orders/${order.id}/finalize`)
          .send({})
        assert.equal(
          finalize.status,
          200,
          `finalize answered ${finalize.status}: ${JSON.stringify(finalize.body)}`
        )
        const priced = await snapshot(client, order.id)
        assert.equal(priced.order.spots_locked, true, 'finalizing did not pin the spots')
        assert.ok(priced.order.total !== null, 'finalizing did not price the order')

        const label = await request(app)
          .patch(`/api/orders/${order.id}`)
          .send({ notes: 'ready to pay' })
        assert.equal(label.status, 200, `label answered ${label.status}`)

        const after = await snapshot(client, order.id)
        assert.equal(after.order.notes, 'ready to pay')
        assert.deepEqual(
          { total: after.order.total, spots_locked: after.order.spots_locked, items: after.items },
          {
            total: priced.order.total,
            spots_locked: priced.order.spots_locked,
            items: priced.items,
          },
          'the label moved money or the spot pin'
        )
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('notes is written and an explicit null clears it', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const { order } = await anOpenPurchaseOrder(client)
      await asAdmin(admin, async () => {
        const written = await request(app)
          .patch(`/api/orders/${order.id}`)
          .send({ notes: 'left on the porch' })
        assert.equal(written.status, 200, written.text)
        assert.equal(
          (await client.query(`SELECT notes FROM orders.orders WHERE id = $1`, [order.id])).rows[0]
            .notes,
          'left on the porch'
        )

        const cleared = await request(app).patch(`/api/orders/${order.id}`).send({ notes: null })
        assert.equal(cleared.status, 200, cleared.text)
        assert.equal(
          (await client.query(`SELECT notes FROM orders.orders WHERE id = $1`, [order.id])).rows[0]
            .notes,
          null
        )
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('review_created is written by a PATCH', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const { order } = await anOpenPurchaseOrder(client)
      await asAdmin(admin, async () => {
        const res = await request(app)
          .patch(`/api/orders/${order.id}`)
          .send({ review_created: true })
        assert.equal(res.status, 200, res.text)
        assert.equal(res.body.order.review_created, true)

        const { rows } = await client.query(
          `SELECT review_created FROM orders.orders WHERE id = $1`,
          [order.id]
        )
        assert.equal(rows[0]?.review_created, true)
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('a PATCH clears cancelled_at and reopens a cancelled order, and only a cancelled one', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const cancelled = await anOrder(client, await aUser(client), {
        direction: 'purchase',
        cancelled_at: new Date().toISOString(),
      }).withLots(1)
      await asAdmin(admin, async () => {
        const notCancelled = await anOpenPurchaseOrder(client)
        const refused = await request(app)
          .patch(`/api/orders/${notCancelled.order.id}`)
          .send({ cancelled_at: null })
        assert.equal(refused.status, 409, refused.text)

        const reopened = await request(app)
          .patch(`/api/orders/${cancelled.id}`)
          .send({ cancelled_at: null })
        assert.equal(reopened.status, 200, reopened.text)
        assert.equal(reopened.body.order.cancelled_at, null)

        const { rows } = await client.query(
          `SELECT cancelled_at FROM orders.orders WHERE id = $1`,
          [cancelled.id]
        )
        assert.equal(rows[0]?.cancelled_at, null)
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('a PATCH refuses to set cancelled_at to anything but null', async () => {
  await inPinnedTransaction(
    async (client: PoolClient) => {
      const { order } = await anOpenPurchaseOrder(client)
      await asAdmin(admin, async () => {
        const res = await request(app)
          .patch(`/api/orders/${order.id}`)
          .send({ cancelled_at: new Date().toISOString() })
        assert.equal(res.status, 422, res.text)

        const { rows } = await client.query(
          `SELECT cancelled_at FROM orders.orders WHERE id = $1`,
          [order.id]
        )
        assert.equal(rows[0]?.cancelled_at, null, 'a refused PATCH still wrote cancelled_at')
      })
    },
    { actor: TEST_ACTOR.id, lock: ORDER_LOCK }
  )
})

test('nothing this file did survived the transactions', async () => {
  const metalsNow = await outside<{ name: string; bid: string }>(
    `SELECT sp.metal_id, sp.bid FROM spots.spots sp ORDER BY sp.metal_id`
  )
  for (const row of metalsNow) {
    assert.notEqual(
      Number(row.bid),
      PINNED_BIDS[row.name],
      `a pinned sentinel bid for ${row.name} escaped into spots.spots`
    )
  }
})
