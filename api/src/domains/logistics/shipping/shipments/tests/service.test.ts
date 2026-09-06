import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import { randomUUID } from 'node:crypto'
import pool from '#pool'
import { inRollback } from '#shared/testing/rollback.ts'
import { aUser, anOrder, carrierServiceId, packageId } from '#shared/testing/builders/index.ts'
import * as dual from '#logistics/shipping/shipments/service.ts'
import * as fulfillmentService from '#logistics/fulfillments/service.ts'

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

const anOrderWithoutShipment = async (c: PoolClient) => {
  const order = await anOrder(c, await aUser(c), { direction: 'purchase' })
  return order.id
}

const inbound = async (c: PoolClient, orderId: string) => dual.create(orderId, 'Inbound', c)

test('creating a shipment writes the shipment, its fulfillment and the link', async () => {
  await inRollback(async (c: PoolClient) => {
    const orderId = await anOrderWithoutShipment(c)
    assert.ok(orderId, 'the fixture did not build an order')
    const created = await inbound(c, orderId)
    assert.ok(created, 'the service returned nothing')

    const ship = await c.query('SELECT 1 FROM shipping.shipments WHERE id = $1', [created.id])
    const link = await c.query(
      'SELECT fulfillment_id FROM fulfillments.shipments WHERE shipment_id = $1',
      [created.id]
    )
    assert.equal(ship.rows.length, 1, 'the shipment did not arrive')
    assert.equal(link.rows.length, 1, 'the fulfillment link did not arrive')

    const {
      rows: [f],
    } = await c.query('SELECT order_id FROM fulfillments.fulfillments WHERE id = $1', [
      link.rows[0].fulfillment_id,
    ])
    assert.equal(f.order_id, orderId, 'the fulfillment points at the wrong order')
  })
})

test('a mirrored shipment can still be found by its order', async () => {
  await inRollback(async (c: PoolClient) => {
    const orderId = await anOrderWithoutShipment(c)
    assert.ok(orderId, 'the fixture did not build an order')
    await inbound(c, orderId)

    const found = await dual.getByOrder(orderId, c)
    assert.ok(found, 'the shipment cannot be found by its order')

    const link = await dual.getOrderLink(found.id, c)
    assert.equal(link?.order_id, orderId)
    assert.equal(link?.direction, 'purchase')
  })
})

test('a second shipment on an order reuses its fulfillment', async () => {
  await inRollback(async (c: PoolClient) => {
    const orderId = await anOrderWithoutShipment(c)
    assert.ok(orderId, 'the fixture did not build an order')
    const first = await inbound(c, orderId)
    assert.ok(first, 'the first call returned nothing')
    const second = await dual.create(orderId, 'Outbound', c)
    assert.ok(second, 'the second call returned nothing')

    const { rows } = await c.query(
      'SELECT DISTINCT fulfillment_id FROM fulfillments.shipments WHERE shipment_id = ANY($1::uuid[])',
      [[first.id, second.id]]
    )
    assert.equal(rows.length, 1, 'a second fulfillment was created for one order')
  })
})

test('creating a shipment for an order that does not exist refuses instead of shipping silently', async () => {
  await inRollback(async (c: PoolClient) => {
    await assert.rejects(() => dual.create(randomUUID(), 'Inbound', c), /does not exist/)
  })
})

test('an update writes the tracking number, status, service and package by id', async () => {
  await inRollback(async (c: PoolClient) => {
    const orderId = await anOrderWithoutShipment(c)
    assert.ok(orderId, 'the fixture did not build an order')
    const created = await inbound(c, orderId)
    assert.ok(created, 'the service returned nothing')
    const tracking = `probe-${randomUUID().slice(0, 8)}`
    const serviceId = await carrierServiceId(c, 'Express Saver')
    const pkgId = await packageId(c, 'Small Box')

    await dual.update(
      created.id,
      {
        tracking_number: tracking,
        shipping_status: 'In Transit',
        package_id: pkgId,
        carrier_service_id: serviceId,
      },
      c
    )

    const {
      rows: [s],
    } = await c.query(
      `SELECT s.tracking_number, sv.name AS service, pk.label AS package
       FROM shipping.shipments s
       LEFT JOIN shipping.services sv ON sv.id = s.carrier_service_id
       LEFT JOIN shipping.packages pk ON pk.id = s.package_id
       WHERE s.id = $1`,
      [created.id]
    )
    assert.equal(s.tracking_number, tracking)
    assert.equal(s.service, 'Express Saver', 'the service id was not written')
    assert.equal(s.package, 'Small Box', 'the package id was not written')
  })
})

test('marking a shipment delivered completes its fulfillment', async () => {
  await inRollback(async (c: PoolClient) => {
    const orderId = await anOrderWithoutShipment(c)
    assert.ok(orderId, 'the fixture did not build an order')
    const created = await inbound(c, orderId)
    assert.ok(created, 'the service returned nothing')
    await dual.update(created.id, { shipping_status: 'Delivered' }, c)

    const {
      rows: [f],
    } = await c.query(
      `SELECT f.status FROM fulfillments.fulfillments f
       JOIN fulfillments.shipments fs ON fs.fulfillment_id = f.id
       WHERE fs.shipment_id = $1`,
      [created.id]
    )
    assert.equal(f.status, 'COMPLETED')
  })
})

test('deleting a shipment removes it and its link from both schemas', async () => {
  await inRollback(async (c: PoolClient) => {
    const orderId = await anOrderWithoutShipment(c)
    assert.ok(orderId, 'the fixture did not build an order')
    const created = await inbound(c, orderId)
    assert.ok(created, 'the service returned nothing')

    await dual.remove(created.id, c)

    const nx = await c.query('SELECT 1 FROM shipping.shipments WHERE id = $1', [created.id])
    const link = await c.query('SELECT 1 FROM fulfillments.shipments WHERE shipment_id = $1', [
      created.id,
    ])
    assert.equal(nx.rows.length, 0, 'the shipment survived in the shipping schema')
    assert.equal(link.rows.length, 0, 'the fulfillment link survived')
  })
})

test('rolling back a shipment write undoes the order it hangs off too', async () => {
  const other = await pool.connect()
  try {
    await client.query('BEGIN')
    const orderId = await anOrderWithoutShipment(client)
    assert.ok(orderId, 'the fixture did not build an order')

    const created = await inbound(client, orderId)
    assert.ok(created, 'the service returned nothing')
    const inside = await client.query('SELECT 1 FROM shipping.shipments WHERE id = $1', [
      created.id,
    ])
    assert.equal(inside.rows.length, 1, 'the write did not happen at all')
    const seen = await other.query('SELECT 1 FROM shipping.shipments WHERE id = $1', [created.id])
    assert.equal(seen.rows.length, 0, 'an uncommitted shipment was visible elsewhere')

    await client.query('ROLLBACK')

    const after = await other.query('SELECT 1 FROM shipping.shipments WHERE id = $1', [created.id])
    assert.equal(after.rows.length, 0, 'the shipment write escaped the transaction')

    const order = await other.query('SELECT 1 FROM orders.orders WHERE id = $1', [orderId])
    assert.equal(order.rows.length, 0, 'the fixture order escaped the transaction')
  } finally {
    other.release()
  }
})

// LD F3. A cancel links a SECOND shipment to the same fulfillment, and every
// "the fulfillment's parcel" read ordered the links by their own random uuid -
// so which leg the customer, the documents and `updateTracking` saw was a coin
// flip per order. The return leg is its own kind of link, never the parcel.
test('the return leg never becomes the fulfillment\'s parcel', async () => {
  await inRollback(async (c: PoolClient) => {
    const orderId = await anOrderWithoutShipment(c)
    const handover = await inbound(c, orderId)
    assert.ok(handover, 'the fixture did not build the inbound leg')

    const returned = await dual.returnLeg(orderId, {}, c)
    assert.ok(returned, 'a SHIPMENT order was refused its return leg')
    assert.notEqual(returned, handover.id, 'the return reused the inbound parcel')

    const links = await c.query(
      'SELECT count(*)::int AS n FROM fulfillments.shipments fs' +
        ' JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id WHERE f.order_id = $1',
      [orderId]
    )
    assert.equal(links.rows[0].n, 2, 'the two legs are not both on the order')

    const view = await fulfillmentService.getForOrder(orderId, null, true, c)
    assert.equal(view?.parcel?.id, handover.id, 'the fulfillment picked the return leg')
    assert.equal(view?.parcel?.direction, 'Inbound')

    const byOrder = await dual.getByOrder(orderId, c)
    assert.equal(byOrder?.id, handover.id, 'getByOrder answered the return leg')

    const leg = await dual.returnLegOf(orderId, c)
    assert.equal(leg?.id, returned, 'the return leg cannot be found by direction')
  })
})

// LD F4. `create(order_id, 'Return')` resolved the order's existing fulfillment
// and asserted its category was SHIPMENT, so an order the customer handed over
// in person could not be cancelled at all.
test('a pickup order is cancellable - it simply has no return label', async () => {
  await inRollback(async (c: PoolClient) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' })
    await fulfillmentService.chooseDefault(order.id, 'purchase', 'PICKUP', c)

    assert.equal(
      await dual.returnLeg(order.id, {}, c),
      null,
      'a pickup order was refused instead of simply having nothing to post back'
    )
  })
})

test('a second cancel is refused rather than orphaning the first return label', async () => {
  await inRollback(async (c: PoolClient) => {
    const orderId = await anOrderWithoutShipment(c)
    await inbound(c, orderId)

    const first = await dual.returnLeg(orderId, {}, c)
    assert.ok(first)
    await dual.update(first, { tracking_number: `794${Date.now() % 1000000000}` }, c)

    await assert.rejects(() => dual.returnLeg(orderId, {}, c), /already been cancelled/)
  })
})

test('an unlabelled return leg is reused, not duplicated', async () => {
  await inRollback(async (c: PoolClient) => {
    const orderId = await anOrderWithoutShipment(c)
    await inbound(c, orderId)

    const first = await dual.returnLeg(orderId, { package_id: await packageId(c) }, c)
    const second = await dual.returnLeg(orderId, { carrier_service_id: await carrierServiceId(c) }, c)
    assert.equal(second, first, 'a second return shipment was minted')

    const shipment = await dual.getById(first!, c)
    assert.ok(shipment?.package_id, 'the first patch was lost')
    assert.ok(shipment?.carrier_service_id, 'the second patch was lost')
  })
})
