import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { assertNothingEscaped, inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import * as place from '#orders/place.ts'
import * as fulfillmentService from '#logistics/fulfillments/service.ts'
import {
  aUser,
  anAddress,
  aProduct,
  packageId as builtPackageId,
  carrierServiceId,
  fulfillmentMethodId,
} from '#shared/testing/builders/index.ts'

let customer: string
let addressId: string
let packageId: string
let labelServiceId: string
let dropoffMethodId: string

const aWorld = async (c: PoolClient) => {
  const person = await aUser(c, { name: 'Placement Customer' })
  const address = await anAddress(c, person)
  customer = person.id
  addressId = address.id
  packageId = await builtPackageId(c, 'Small Box')
  labelServiceId = await carrierServiceId(c, 'Express Saver')
  dropoffMethodId = await fulfillmentMethodId(c, 'CARRIER DROPOFF', 'purchase')
  return { customer, addressId }
}

afterAll(async () => {
  await pool.end()
})

const carrierAnswers = (): typeof place.LIVE & { labelled: string[] } => {
  const labelled: string[] = []
  return Object.assign(
    {
      buyLabel: async (shipment_id: string) => {
        labelled.push(shipment_id)
      },
      authorize: async () => {},
      confirm: async () => {},
    },
    { labelled }
  )
}

type ScrapItem = {
  metal_id: string | null
  quantity?: number
  pre_melt?: number
  post_melt?: number
  purity?: number
  unit?: string
  premium?: number
}
const GOLD: ScrapItem = {
  metal_id: 'Gold',
  quantity: 1,
  pre_melt: 10,
  post_melt: 9.5,
  purity: 0.9999,
  unit: 'g',
  premium: 0.8,
}

async function primeCheckout(
  c: PoolClient,
  {
    items = [GOLD] as ScrapItem[],
    products = [] as { id: string; quantity?: number; premium?: number | null }[],
    withFulfillment = true,
  } = {}
): Promise<string> {
  const {
    rows: [details],
  } = await c.query(
    `INSERT INTO payments.details (user_id, account_holder, last_four)
     VALUES ($1, 'Row Flow Test', '6789') RETURNING id`,
    [customer]
  )
  const draft = withFulfillment
    ? await fulfillmentService.createDraft(dropoffMethodId, 'purchase', c)
    : null
  const {
    rows: [co],
  } = await c.query(
    `INSERT INTO checkout.checkouts (user_id, direction) VALUES ($1, 'purchase')
     ON CONFLICT (user_id, direction) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING id`,
    [customer]
  )
  await c.query(
    `UPDATE checkout.checkouts SET fulfillment_id = $2, payment_details_id = $3
     WHERE id = $1`,
    [co.id, draft?.fulfillment.id ?? null, details.id]
  )

  if (draft) {
    await fulfillmentService.patchChoices(
      draft.fulfillment.id,
      {
        shipment: {
          shipper_address_id: addressId,
          package_id: packageId,
          carrier_service_id: labelServiceId,
        },
      },
      c
    )
  }

  await c.query(
    `DELETE FROM inventory.lots li USING checkout.lots cl
      WHERE cl.lot_id = li.id AND cl.checkout_id = $1`,
    [co.id]
  )
  for (const item of items) {
    await c.query(
      `WITH lot AS (
         INSERT INTO inventory.lots
                (bullion_id, metal_id, pre_melt, post_melt, purity, unit, quantity)
         VALUES (NULL, $2, $3, $4, $5, COALESCE($6, 't oz'), COALESCE($7, 1))
         RETURNING id
       )
       INSERT INTO checkout.lots (checkout_id, lot_id) SELECT $1, lot.id FROM lot`,
      [
        co.id,
        item.metal_id,
        item.pre_melt ?? null,
        item.post_melt ?? null,
        item.purity ?? null,
        item.unit ?? null,
        item.quantity ?? 1,
      ]
    )
  }
  for (const product of products) {
    await c.query(
      `WITH lot AS (
         INSERT INTO inventory.lots
                (bullion_id, metal_id, pre_melt, post_melt, purity, content_snapshot,
                 unit, quantity)
         SELECT b.id, b.metal_id, b.gross, NULL, b.purity, b.content, 't oz', $3
           FROM products.bullion b WHERE b.id = $2
         RETURNING id
       )
       INSERT INTO checkout.lots (checkout_id, lot_id) SELECT $1, lot.id FROM lot`,
      [co.id, product.id, product.quantity ?? 1]
    )
  }
  return co.id
}

const inPinned = <T>(fn: (c: PoolClient) => Promise<T>): Promise<T> =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.ADDRESSES] })

test('a checkout becomes an order with its items and its fulfillment', async () => {
  await inPinned(async (c: PoolClient) => {
    await aWorld(c)
    const order = await place.place(await primeCheckout(c), carrierAnswers())

    assert.equal(order.order.direction, 'purchase')
    assert.equal(order.state, 'Awaiting Receipt', 'a freshly placed purchase awaits its parcel')
    assert.ok(Number(order.order.number) > 0)
    assert.equal(order.order.user_id, customer)

    const { rows: items } = await c.query(
      `SELECT li.purity, li.content, li.premium, li.unit, li.quantity, li.metal_id
         FROM orders.lots ol JOIN inventory.lots li ON li.id = ol.lot_id
        WHERE ol.order_id = $1`,
      [order.order.id]
    )
    assert.equal(items.length, 1)
    assert.equal(Number(items[0].purity), 0.9999, 'the rounding 058 fixed must not come back')
    assert.ok(
      Math.abs(Number(items[0].content) - (9.5 / 31.1034768) * 0.9999) < 1e-9,
      `content is ${items[0].content}`
    )
    assert.notEqual(Number(items[0].premium), 0.8, "the browser's premium survived")
    assert.ok(Number(items[0].premium) > 0, 'the line was left with no premium at all')
    assert.ok(items[0].metal_id, 'inventory.lots.metal_id is NOT NULL')

    const { rows: f } = await c.query(
      `SELECT m.type, m.category FROM fulfillments.fulfillments fu
         JOIN fulfillments.methods m ON m.id = fu.method_id
        WHERE fu.order_id = $1`,
      [order.order.id]
    )
    assert.equal(f[0].type, 'CARRIER DROPOFF')
    assert.equal(f[0].category, 'SHIPMENT')

    const { rows: unassigned } = await c.query(
      `SELECT count(*)::int n FROM orders.lots ol
        WHERE ol.order_id = $1
          AND EXISTS (SELECT 1 FROM inventory.lot_sources ls
                       WHERE ls.source_lot_id = ol.lot_id AND ls.kind = 'batch')`,
      [order.order.id]
    )
    assert.equal(unassigned[0].n, 0, 'placement assigned a lot to a refiner by itself')
  })
})

test('the order number comes from the native sequence and collides with nothing', async () => {
  await inPinned(async (c: PoolClient) => {
    await aWorld(c)
    const { rows: before } = await c.query(`SELECT last_value FROM orders.purchase_number_seq`)
    const order = await place.place(await primeCheckout(c), carrierAnswers())
    const { rows: after } = await c.query(`SELECT last_value FROM orders.purchase_number_seq`)

    assert.ok(
      Number(after[0].last_value) > Number(before[0].last_value),
      'the sequence did not advance - two orders could take the same number'
    )
    assert.ok(
      Number(order.order.number) > Number(before[0].last_value),
      'the number drawn is not above where the sequence started'
    )
    const { rows: clash } = await c.query(
      `SELECT count(*) AS n FROM orders.orders
        WHERE direction = 'purchase' AND number = $1 AND id <> $2`,
      [order.order.number, order.order.id]
    )
    assert.equal(Number(clash[0].n), 0, 'the number handed out already belongs to an order')
  })
})

test('the order takes a copy of the address, not a pointer to it', async () => {
  await inPinned(async (c: PoolClient) => {
    await aWorld(c)
    const order = await place.place(await primeCheckout(c), carrierAnswers())

    const { rows } = await c.query(
      `SELECT address_id, source_address_id FROM orders.addresses WHERE order_id = $1`,
      [order.order.id]
    )
    assert.equal(rows[0].source_address_id, addressId, 'the book row it came from')
    assert.notEqual(rows[0].address_id, addressId, 'a snapshot must be its own row')

    await c.query(`UPDATE places.addresses SET city = 'Moved' WHERE id = $1`, [addressId])
    const { rows: snap } = await c.query(`SELECT city FROM places.addresses WHERE id = $1`, [
      rows[0].address_id,
    ])
    assert.notEqual(snap[0].city, 'Moved', "the order's address changed underneath it")
  })
})

test('spots are frozen per metal the order actually contains', async () => {
  await inPinned(async (c: PoolClient) => {
    await aWorld(c)
    const order = await place.place(
      await primeCheckout(c, {
        items: [
          { metal_id: 'Gold', quantity: 1, pre_melt: 1, purity: 1, unit: 't oz' },
          { metal_id: 'Silver', quantity: 1, pre_melt: 2, purity: 1, unit: 't oz' },
        ],
      }),
      carrierAnswers()
    )

    const { rows } = await c.query(
      `SELECT s.metal_id, s.ask, s.bid FROM orders.spots s
        WHERE s.order_id = $1 ORDER BY s.metal_id`,
      [order.order.id]
    )
    assert.deepEqual(
      rows.map((r) => r.metal_id),
      ['Gold', 'Silver']
    )
    assert.ok(Number(rows[0].ask) > 0, 'a frozen spot with no price is not frozen')
    assert.equal(rows.length, 2)
  })
})

test('the parcel is sealed at placement holding what the customer chose', async () => {
  await inPinned(async (c: PoolClient) => {
    await aWorld(c)
    const world = carrierAnswers()
    const order = await place.place(await primeCheckout(c), world)

    const {
      rows: [shipment],
    } = await c.query(
      `SELECT s.id, s.tracking_number, s.shipping_status, s.cost, s.insured,
              s.declared_value, s.package_id, s.carrier_service_id, s.pickup_type,
              s.direction::text AS direction
         FROM shipping.shipments s
         JOIN fulfillments.shipments fs ON fs.shipment_id = s.id
         JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
        WHERE f.order_id = $1`,
      [order.order.id]
    )
    assert.equal(shipment.tracking_number, null, 'the shell committed with a label')
    assert.equal(shipment.shipping_status, null)
    assert.equal(shipment.cost, null)
    assert.equal(shipment.insured, true)
    assert.ok(Number(shipment.declared_value) > 0, 'the parcel carries no declared value')
    assert.equal(shipment.package_id, packageId)
    assert.equal(shipment.carrier_service_id, labelServiceId)
    assert.equal(shipment.pickup_type, 'Store Dropoff')
    assert.equal(shipment.direction, 'Inbound')

    assert.deepEqual(world.labelled, [shipment.id])
  })
})

test('a lot whose metal cannot be resolved is refused at the basket, not dropped', async () => {
  await inPinned(async (c: PoolClient) => {
    await aWorld(c)
    await assert.rejects(
      () => primeCheckout(c, { items: [{ metal_id: null as unknown as string, quantity: 1 }] }),
      /metal_id/
    )
  })
})

test('a placed bullion line takes the rate band, not the premium the cart carried', async () => {
  await inPinned(async (c: PoolClient) => {
    await aWorld(c)
    const built = await aProduct(c, { metal_id: 'Gold', content: 1, bid_premium: 1.5 })
    const {
      rows: [band],
    } = await c.query<{ bullion_pct: string }>(
      `SELECT r.bullion_pct FROM rates.rates r
        WHERE r.metal_id = $1 AND $2 >= r.min_qty
          AND (r.max_qty IS NULL OR $2 <= r.max_qty)
        ORDER BY r.min_qty`,
      ['Gold', built.content]
    )
    assert.ok(band, 'the rates seed has no gold band for a one-ounce product')
    const product = {
      id: built.id,
      content: built.content,
      bid_premium: built.bid_premium,
      bullion_pct: band.bullion_pct,
    }
    assert.notEqual(
      Number(product.bid_premium),
      Number(product.bullion_pct),
      "the fixture's own premium equals its band, so this check would be vacuous"
    )

    const order = await place.place(
      await primeCheckout(c, {
        items: [],
        products: [{ id: product.id, quantity: 1, premium: Number(product.bid_premium) }],
      }),
      carrierAnswers()
    )

    const { rows: items } = await c.query(
      `SELECT li.bullion_id, li.premium
         FROM orders.lots ol JOIN inventory.lots li ON li.id = ol.lot_id
        WHERE ol.order_id = $1`,
      [order.order.id]
    )
    assert.equal(items.length, 1)
    assert.equal(items[0].bullion_id, product.id)
    assert.equal(
      Number(items[0].premium),
      Number(product.bullion_pct),
      'the placed bullion line is not at the band the order earned'
    )
    assert.notEqual(
      Number(items[0].premium),
      Number(product.bid_premium),
      "the cart's product bid_premium survived placement"
    )
  })
})

test('an empty checkout cannot become an order', async () => {
  await inPinned(async (c: PoolClient) => {
    await aWorld(c)
    const checkout_id = await primeCheckout(c, { items: [] })
    await assert.rejects(() => place.place(checkout_id, carrierAnswers()), /missing lots/)
  })
})

test('an order, its fulfillment and its parcel roll back together', async () => {
  let order_id = ''
  await inPinned(async (c: PoolClient) => {
    await aWorld(c)
    order_id = (await place.place(await primeCheckout(c), carrierAnswers())).order.id
    const { rows } = await c.query(`SELECT 1 FROM orders.orders WHERE id = $1`, [order_id])
    assert.equal(rows.length, 1, 'the order was never written at all')
  })

  for (const [table, predicate] of [
    ['orders.orders', 'id = $1'],
    ['orders.lots', 'order_id = $1'],
    ['orders.spots', 'order_id = $1'],
    ['orders.addresses', 'order_id = $1'],
    ['orders.transactions', 'order_id = $1'],
    ['fulfillments.fulfillments', 'order_id = $1'],
  ] as const) {
    assert.equal(
      await assertNothingEscaped(table, predicate, [order_id]),
      0,
      `the rollback left a ${table} row behind`
    )
  }
})
