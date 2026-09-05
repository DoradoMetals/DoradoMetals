import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { inRollback } from '#shared/testing/rollback.ts'
import * as shipmentService from '#logistics/shipping/shipments/service.ts'

let client: PoolClient

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(),
    0,
    'these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`'
  )
  client = await pool.connect()
})

afterAll(async () => {
  client.release()
  await pool.end()
})

const anOrderWithShipment = async (c: PoolClient) => {
  const { rows } = await c.query(`
    SELECT f.order_id
      FROM shipping.shipments ss
      JOIN fulfillments.shipments fs ON fs.shipment_id = ss.id
      JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
      JOIN orders.orders o ON o.id = f.order_id
     WHERE o.direction = 'purchase'
     LIMIT 1`)
  return rows[0]?.order_id ?? null
}

test('a charge lands on every parcel of the order', async () => {
  await inRollback(async (c: PoolClient) => {
    const orderId = await anOrderWithShipment(c)
    assert.ok(orderId, 'no purchase order has a linked shipment')

    const charge = 41.37
    await shipmentService.setChargeForOrder(orderId, charge, c)

    const nx = await c.query(
      `
      SELECT ss.cost
        FROM shipping.shipments ss
        JOIN fulfillments.shipments fs ON fs.shipment_id = ss.id
        JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
       WHERE f.order_id = $1`,
      [orderId]
    )

    assert.ok(nx.rows.length > 0, 'the update reached no rows')
    for (const r of nx.rows) assert.equal(Number(r.cost), charge)
  })
})

test('the charge lands on that order and no other', async () => {
  await inRollback(async (c: PoolClient) => {
    const orderId = await anOrderWithShipment(c)
    assert.ok(orderId, 'no purchase order has a linked shipment')

    const others = await c.query(
      `SELECT ss.id, ss.cost
         FROM shipping.shipments ss
         LEFT JOIN fulfillments.shipments fs ON fs.shipment_id = ss.id
         LEFT JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
        WHERE f.order_id IS DISTINCT FROM $1 ORDER BY ss.id`,
      [orderId]
    )
    assert.ok(others.rows.length > 0, 'dev has no other shipment to compare against')

    await shipmentService.setChargeForOrder(orderId, 41.37, c)

    const after = await c.query(
      `SELECT ss.id, ss.cost
         FROM shipping.shipments ss
         LEFT JOIN fulfillments.shipments fs ON fs.shipment_id = ss.id
         LEFT JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
        WHERE f.order_id IS DISTINCT FROM $1 ORDER BY ss.id`,
      [orderId]
    )
    assert.deepEqual(
      after.rows.map((r) => [r.id, String(r.cost)]),
      others.rows.map((r) => [r.id, String(r.cost)]),
      'the update reached a shipment belonging to another order'
    )
  })
})

test('rolling back undoes the write', async () => {
  const other = await pool.connect()
  try {
    const orderId = await anOrderWithShipment(other)
    assert.ok(orderId, 'no purchase order has a linked shipment')
    const read = `
      SELECT ss.cost
        FROM shipping.shipments ss
        JOIN fulfillments.shipments fs ON fs.shipment_id = ss.id
        JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
       WHERE f.order_id = $1 ORDER BY ss.id`
    const before = (await other.query(read, [orderId])).rows.map((r) => String(r.cost))

    await client.query('BEGIN')
    await shipmentService.setChargeForOrder(orderId, 99.99, client)
    await client.query('ROLLBACK')

    const after = (await other.query(read, [orderId])).rows.map((r) => String(r.cost))
    assert.deepEqual(after, before, 'the write escaped the transaction')
  } finally {
    other.release()
  }
})
