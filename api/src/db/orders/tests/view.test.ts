import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { LOCKS } from '#shared/testing/locks.ts'
import { rollbackIn } from '#shared/testing/rollback.ts'
import {
  aUser,
  anAddress,
  anOrder,
  aProduct,
  aShipment,
  aPayout,
} from '#shared/testing/builders/index.ts'
import * as orders from '#db/orders/repo.ts'
import { OrderViewFacts } from '@dorado/contracts'

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(),
    0,
    'these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`'
  )
})
afterAll(async () => {
  await pool.end()
})

const inRollback = rollbackIn({ lock: [LOCKS.ORDERS, LOCKS.ADDRESSES] })

test('the order view is one read that parses through OrderViewFacts', async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c)
    const address = await anAddress(c, user)
    const product = await aProduct(c)
    const order = await anOrder(c, user, { direction: 'purchase' })
      .withLots(1)
      .withBullion(product, 3, { price: 250 })
      .withAddress(address)
      .withTotals({ total: 1234.5 })
    await aShipment(c, order)
    await aPayout(c, user, { order })

    const raw = await orders.view(order.id, c)
    assert.ok(raw, 'the view read nothing back')
    const parsed = OrderViewFacts.parse(raw)

    assert.equal(parsed.order.id, order.id)
    assert.equal(parsed.user?.id, user.id)
    assert.equal(parsed.address?.id ? true : false, true, 'the address did not nest')
    assert.equal(parsed.totals?.total, 1234.5)
    assert.equal(parsed.lots.length, 2, 'the lines did not nest by table')
    assert.equal(parsed.shipments.length, 1, 'the shipment did not nest by table')
    assert.ok(parsed.payout, 'the payout did not nest')
  })
})

test('a bullion line carries its payable and its line total from SQL, and no product', async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c)
    const product = await aProduct(c)
    const order = await anOrder(c, user, { direction: 'purchase' }).withBullion(product, 4, {
      price: 25,
    })

    const view = await orders.view(order.id, c)
    assert.ok(view)
    const line = view.lots.find((i) => i.lot.bullion_id === product.id)
    assert.ok(line, 'the bullion line is missing')
    assert.ok(!('product' in line), 'the view still embeds the catalogue row')
    assert.equal(line.line_total, 100, 'line_total is not price x quantity')
    assert.equal(
      line.payable,
      line.lot.content === null || line.premium === null ? null : line.lot.content * line.premium,
      'payable is not content x premium'
    )
  })
})

test('an order with no children answers empty arrays and nulls, not undefined', async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c)
    const order = await anOrder(c, user, { direction: 'purchase' })

    const view = await orders.view(order.id, c)
    assert.ok(view)
    assert.deepEqual(view.lots, [])
    assert.deepEqual(view.shipments, [])
    assert.equal(view.address, null)
    assert.equal(view.totals, null)
    assert.equal(view.pickup, null)
    assert.equal(view.payout, null)
  })
})

test('an id nobody owns reads back nothing rather than an empty view', async () => {
  await inRollback(async (c: PoolClient) => {
    assert.equal(await orders.view('00000000-0000-4000-8000-000000000000', c), undefined)
  })
})

test('a scrap line is named by the SQL read, numbered per metal; a product line is not', async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c)
    const product = await aProduct(c)
    const order = await anOrder(c, user, { direction: 'purchase' })
      .withLots(2, { metal_id: 'Gold' })
      .withLots(1, { metal_id: 'Silver' })
      .withBullion(product, 1, { price: 10 })

    const view = await orders.view(order.id, c)
    assert.ok(view)

    const scrap = view.lots
      .filter((i) => i.lot.bullion_id === null)
      .sort((a, b) => (a.id < b.id ? -1 : 1))
    assert.equal(scrap.length, 3, 'the three scrap lots did not all come back')
    const references = view.lots.map((i) => i.lot.reference)
    assert.deepEqual(
      [...references].sort(),
      [`Lot ${order.number}-A`, `Lot ${order.number}-B`, `Lot ${order.number}-C`, `Lot ${order.number}-D`],
      "the per-order lettering is not the window function's"
    )
    assert.equal(new Set(references).size, 4, 'two lots share a reference')

    const bullion = view.lots.find((i) => i.lot.bullion_id === product.id)
    assert.ok(bullion, 'the bullion line is missing')
    assert.ok(bullion.lot.form, 'a product lot lost its form')
  })
})

test('a shipment carries its service name and package label, not just their ids', async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c)
    const order = await anOrder(c, user, { direction: 'purchase' }).withLots(1)
    await aShipment(c, order)

    const view = await orders.view(order.id, c)
    assert.ok(view)
    const [shipment] = view.shipments
    assert.ok(shipment, 'the shipment did not nest')

    const { rows: services } = await c.query('SELECT name FROM shipping.services WHERE id = $1', [
      shipment.carrier_service_id,
    ])
    const { rows: boxes } = await c.query('SELECT label FROM shipping.packages WHERE id = $1', [
      shipment.package_id,
    ])
    assert.equal(shipment.service_name, services[0].name, "the service name is not the row's")
    assert.equal(shipment.package_label, boxes[0].label, "the package label is not the row's")
  })
})
