import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { mockSessions, restoreSessions, as, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser, anAdmin, anAddress, anOrder, aShipment } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')
const addressService = await import('#orders/addresses/service.ts')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const REASON = 'Customer moved before the parcel left'

async function world(c: PoolClient, direction: 'purchase' | 'sale' = 'purchase') {
  const customer = await aUser(c, { name: 'Relabel Customer' })
  const admin = await anAdmin(c)
  const old = await anAddress(c, customer)
  const next = await anAddress(c, customer, {
    state: direction === 'sale' ? 'TX' : 'OK',
    zip: '73301',
    default_shipping: false,
  })
  const other = await anAddress(c, customer, { state: 'CA', zip: '90001', default_shipping: false })
  const order = await anOrder(c, customer, { direction }).withLots(1).withAddress(old)
  const shipment = await aShipment(c, order)
  return { customer, admin, next, other, order, shipment }
}

const trackingOf = async (c: PoolClient, id: string) =>
  (await c.query(`SELECT tracking_number FROM shipping.shipments WHERE id = $1`, [id])).rows[0]
    .tracking_number

const reasonsOf = async (c: PoolClient, order_id: string) =>
  (await c.query(`SELECT reason FROM orders.action_reasons WHERE order_id = $1`, [order_id])).rows

const run = (fn: (c: PoolClient) => Promise<void>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS })

test('a change snapshots the new address, stores the reason, voids then buys once', async () => {
  await run(async (c) => {
    const w = await world(c)
    const calls: string[] = []
    const view = await addressService.change(
      w.order.id,
      { address_id: w.next.id, reason: REASON },
      async (tn) => {
        calls.push(`void ${tn}`)
        return true
      },
      async (id) => {
        calls.push(`buy ${id}`)
      },
      async (id) => {
        calls.push(`buy ${id}`)
      }
    )
    assert.deepEqual(calls, [`void ${w.shipment.tracking_number}`, `buy ${w.shipment.id}`])
    assert.equal(view.address?.state, 'OK')
    const link = await c.query(
      `SELECT source_address_id FROM orders.addresses WHERE order_id = $1`,
      [w.order.id]
    )
    assert.equal(link.rows[0].source_address_id, w.next.id)
    assert.equal((await reasonsOf(c, w.order.id))[0].reason, REASON)
    assert.equal(await trackingOf(c, w.shipment.id), null)
  })
})

test('a failed void leaves the tracking number and buys nothing', async () => {
  await run(async (c) => {
    const w = await world(c)
    let bought = 0
    const buy = async () => {
      bought += 1
    }
    await addressService.change(
      w.order.id,
      { address_id: w.next.id, reason: REASON },
      async () => false,
      buy,
      buy
    )
    assert.equal(bought, 0)
    assert.equal(await trackingOf(c, w.shipment.id), w.shipment.tracking_number)
  })
})

test('a sale that would move state is refused and writes nothing', async () => {
  await run(async (c) => {
    const w = await world(c, 'sale')
    await assert.rejects(
      () => addressService.change(w.order.id, { address_id: w.other.id, reason: REASON }),
      /sales tax/
    )
    assert.deepEqual(await reasonsOf(c, w.order.id), [])
    assert.equal(await trackingOf(c, w.shipment.id), w.shipment.tracking_number)
  })
})

test('a shipped parcel is refused', async () => {
  await run(async (c) => {
    const w = await world(c)
    await c.query(`UPDATE shipping.shipments SET shipped_at = now() WHERE id = $1`, [w.shipment.id])
    await assert.rejects(
      () => addressService.change(w.order.id, { address_id: w.next.id, reason: REASON }),
      /in motion/
    )
    assert.deepEqual(await reasonsOf(c, w.order.id), [])
  })
})

test('a customer gets 403 and an admin gets past the guard', async () => {
  await run(async (c) => {
    const w = await world(c)
    await as({ ...w.customer, role: 'user' }, async () => {
      const res = await request(app)
        .post(`/api/orders/${w.order.id}/address`)
        .send({ address_id: w.next.id, reason: REASON })
      assert.equal(res.status, 403)
    })
    await asAdmin(w.admin, async () => {
      const res = await request(app)
        .post(`/api/orders/${w.order.id}/address`)
        .send({ address_id: w.next.id, reason: 'short' })
      assert.equal(res.status, 400)
    })
  })
})

test('a second change shows the newest address, with the book id it came from', async () => {
  await run(async (c) => {
    const w = await world(c)
    const noop = async () => true
    const buy = async () => {}
    await addressService.change(
      w.order.id,
      { address_id: w.next.id, reason: REASON },
      noop,
      buy,
      buy
    )
    const third = await anAddress(c, w.customer, {
      state: 'NM',
      zip: '87101',
      default_shipping: false,
    })
    const view = await addressService.change(
      w.order.id,
      { address_id: third.id, reason: REASON },
      noop,
      buy,
      buy
    )
    assert.equal(view.address?.state, 'NM')
    assert.equal(view.address?.source_address_id, third.id)
    assert.notEqual(view.address?.id, third.id)
    const rows = await c.query(`SELECT 1 FROM orders.addresses WHERE order_id = $1`, [w.order.id])
    assert.equal(rows.rowCount, 1)
  })
})
