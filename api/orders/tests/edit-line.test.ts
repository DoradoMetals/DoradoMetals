import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { LOCKS } from '#shared/testing/locks.ts'
import * as orders from '#orders/service.ts'

let client: PoolClient

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(),
    0,
    'these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`'
  )
  client = await pool.connect()

  await client.query('SELECT pg_advisory_lock($1)', [LOCKS.ORDERS])
})

afterAll(async () => {
  await client.query('SELECT pg_advisory_unlock($1)', [LOCKS.ORDERS])
  client.release()
  await pool.end()
})

const anOrderWithScrap = async (c: PoolClient) => {
  const {
    rows: [metal],
  } = await c.query('SELECT id FROM metals.metals ORDER BY id LIMIT 1')
  const {
    rows: [order],
  } = await c.query(
    `INSERT INTO orders.orders (direction, status, number)
     VALUES ('purchase', 'Pending', nextval('orders.purchase_number_seq'))
     RETURNING id`
  )
  const {
    rows: [item],
  } = await c.query(
    `INSERT INTO orders.items (id, order_id, metal_id, pre_melt, purity, content, premium, quantity, confirmed, unit)
     VALUES (gen_random_uuid(), $1, $2, 10, 0.9, 9, 0.75, 1, false, 't oz') RETURNING id`,
    [order.id, metal.id]
  )
  const {
    rows: [engagement],
  } = await c.query(`INSERT INTO refiners.orders (order_id) VALUES ($1) RETURNING id`, [order.id])
  await c.query(
    `INSERT INTO refiners.items (order_item_id, refiner_order_id, metal_id, quantity)
     VALUES ($1, $2, $3, 1)`,
    [item.id, engagement.id, metal.id]
  )
  return { orderId: order.id, itemId: item.id }
}

const cleanup = async (c: PoolClient, { orderId }: { orderId: string }) => {
  await c.query(
    'DELETE FROM refiners.items WHERE order_item_id IN (SELECT id FROM orders.items WHERE order_id = $1)',
    [orderId]
  )
  await c.query('DELETE FROM refiners.spots WHERE order_id = $1', [orderId])
  await c.query('DELETE FROM refiners.orders WHERE order_id = $1', [orderId])
  for (const t of ['orders.items', 'orders.spots', 'orders.transactions', 'orders.addresses']) {
    await c.query(`DELETE FROM ${t} WHERE order_id = $1`, [orderId])
  }
  await c.query('DELETE FROM orders.orders WHERE id = $1', [orderId])
}

const anEmptyGoldOrder = async (c: PoolClient) => {
  const {
    rows: [order],
  } = await c.query(
    `INSERT INTO orders.orders (direction, status, number)
     VALUES ('purchase', 'Pending', nextval('orders.purchase_number_seq'))
     RETURNING id`
  )
  await c.query(`INSERT INTO refiners.orders (order_id) VALUES ($1)`, [order.id])
  return { orderId: order.id }
}

const aGoldProductOffItsBand = async (c: PoolClient) => {
  const { rows } = await c.query(
    `SELECT b.id, b.content, b.bid_premium, band.bullion_pct
       FROM products.bullion b
       CROSS JOIN LATERAL (
         SELECT r.bullion_pct FROM rates.rates r
          WHERE r.metal_id = b.metal_id
            AND b.content >= r.min_qty
            AND (r.max_qty IS NULL OR b.content <= r.max_qty)
          ORDER BY r.min_qty LIMIT 1
       ) band
      WHERE b.metal_id = 'Gold' AND b.content IS NOT NULL
        AND b.bid_premium IS DISTINCT FROM band.bullion_pct
      ORDER BY b.content
      LIMIT 1`
  )
  assert.ok(
    rows[0],
    "no gold product's bid_premium differs from its band - this check would be vacuous"
  )
  return rows[0]
}

const bandFor = async (c: PoolClient, metal: string, total: number) => {
  const { rows } = await c.query(
    `SELECT r.scrap_pct, r.bullion_pct FROM rates.rates r
      WHERE r.metal_id = $1 AND $2::numeric >= r.min_qty
        AND (r.max_qty IS NULL OR $2::numeric <= r.max_qty)
      ORDER BY r.min_qty LIMIT 1`,
    [metal, total]
  )
  assert.ok(rows[0], `no ${metal} band covers ${total} - the check would be vacuous`)
  return rows[0]
}

test("a new bullion line is born at its rate band, not at the product's bid premium", async () => {
  const fixture = await anEmptyGoldOrder(client)
  try {
    const product = await aGoldProductOffItsBand(client)

    const created = await orders.createLine(fixture.orderId, { bullion_id: product.id })

    assert.equal(
      Number(created.premium),
      Number(product.bullion_pct),
      'the new bullion line did not come back at its band'
    )
    assert.notEqual(
      Number(created.premium),
      Number(product.bid_premium),
      "the product's own bid_premium reached the order"
    )

    const {
      rows: [stored],
    } = await client.query('SELECT premium FROM orders.items WHERE id = $1', [created.id])
    assert.equal(Number(stored.premium), Number(product.bullion_pct))
  } finally {
    await cleanup(client, fixture)
  }
})

test("adding bullion re-tiers the order's scrap by their combined content", async () => {
  const {
    rows: [gold],
  } = await client.query("SELECT id FROM metals.metals WHERE id = 'Gold'")
  const {
    rows: [order],
  } = await client.query(
    `INSERT INTO orders.orders (direction, status, number)
     VALUES ('purchase', 'Pending', nextval('orders.purchase_number_seq'))
     RETURNING id`
  )
  const fixture = { orderId: order.id }
  try {
    await client.query(`INSERT INTO refiners.orders (order_id) VALUES ($1)`, [order.id])
    const {
      rows: [scrap],
    } = await client.query(
      `INSERT INTO orders.items
         (id, order_id, metal_id, pre_melt, purity, content, premium, quantity, confirmed, unit)
       VALUES (gen_random_uuid(), $1, $2, 5, 0.9, 4.5, 0.75, 1, false, 't oz')
       RETURNING id`,
      [order.id, gold.id]
    )

    const product = await aGoldProductOffItsBand(client)
    const created = await orders.createLine(order.id, { bullion_id: product.id })

    const total = 4.5 + Number(product.content)
    const band = await bandFor(client, 'Gold', total)

    const {
      rows: [scrapNow],
    } = await client.query('SELECT premium FROM orders.items WHERE id = $1', [scrap.id])
    assert.equal(
      Number(scrapNow.premium),
      Number(band.scrap_pct),
      'the scrap was not re-tiered by the total the bullion added to'
    )
    assert.equal(
      Number(created.premium),
      Number(band.bullion_pct),
      "the bullion line did not take the same band's bullion column"
    )
  } finally {
    await cleanup(client, fixture)
  }
})

test('deleting a line removes it and its refiner counterpart together', async () => {
  const fixture = await anOrderWithScrap(client)
  try {
    await orders.removeLine(fixture.itemId)

    const item = await client.query('SELECT 1 FROM orders.items WHERE id = $1', [fixture.itemId])
    const refiner = await client.query('SELECT 1 FROM refiners.items WHERE order_item_id = $1', [
      fixture.itemId,
    ])
    assert.equal(item.rows.length, 0, 'the order line survived')
    assert.equal(refiner.rows.length, 0, 'the refiner counterpart survived the cascade')
  } finally {
    await cleanup(client, fixture)
  }
})

test('a line that does not exist is refused and nothing is deleted', async () => {
  const fixture = await anOrderWithScrap(client)
  try {
    await assert.rejects(
      () => orders.removeLine('00000000-0000-4000-8000-000000000000'),
      /no order item/
    )
    const item = await client.query('SELECT 1 FROM orders.items WHERE id = $1', [fixture.itemId])
    assert.equal(item.rows.length, 1, 'a refused delete removed a different line')
  } finally {
    await cleanup(client, fixture)
  }
})

test('editing a scrap line writes the weights it names and derives the content', async () => {
  const fixture = await anOrderWithScrap(client)
  try {
    const edited = await orders.editLine(fixture.itemId, {
      pre_melt: 10,
      post_melt: 8,
      purity: 0.5,
      unit: 't oz',
      premium: 0.82,
    })

    assert.equal(Number(edited.content), 4, '8 post-melt at 0.5 purity')
    assert.equal(Number(edited.pre_melt), 10)
    assert.equal(Number(edited.premium), 0.82)

    const {
      rows: [item],
    } = await client.query('SELECT content, premium FROM orders.items WHERE id = $1', [
      fixture.itemId,
    ])
    assert.equal(Number(item.content), 4)
    assert.equal(Number(item.premium), 0.82)
  } finally {
    await cleanup(client, fixture)
  }
})

test("a weights-only edit re-tiers the order's lines", async () => {
  const fixture = await anOrderWithScrap(client)
  try {
    const {
      rows: [before],
    } = await client.query('SELECT premium FROM orders.items WHERE id = $1', [fixture.itemId])
    const edited = await orders.editLine(fixture.itemId, { post_melt: 8, purity: 0.5 })
    const band = await bandFor(client, 'Gold', Number(edited.content))
    assert.equal(
      Number(
        (await client.query('SELECT premium FROM orders.items WHERE id = $1', [fixture.itemId]))
          .rows[0].premium
      ),
      Number(band.scrap_pct),
      `the line was left at ${before.premium} rather than its band`
    )
  } finally {
    await cleanup(client, fixture)
  }
})

test('a partial edit leaves the columns it does not name alone', async () => {
  const fixture = await anOrderWithScrap(client)
  try {
    const {
      rows: [before],
    } = await client.query('SELECT pre_melt, purity, unit FROM orders.items WHERE id = $1', [
      fixture.itemId,
    ])

    await orders.editLine(fixture.itemId, { post_melt: 8 })

    const {
      rows: [after],
    } = await client.query(
      'SELECT pre_melt, post_melt, purity, unit FROM orders.items WHERE id = $1',
      [fixture.itemId]
    )
    assert.equal(Number(after.post_melt), 8)
    assert.equal(Number(after.pre_melt), Number(before.pre_melt), 'pre_melt was cleared')
    assert.equal(Number(after.purity), Number(before.purity), 'purity was cleared')
    assert.equal(after.unit, before.unit, 'the unit was cleared')
  } finally {
    await cleanup(client, fixture)
  }
})

test('an explicit null clears the column it names', async () => {
  const fixture = await anOrderWithScrap(client)
  try {
    await orders.editLine(fixture.itemId, { post_melt: null })
    const {
      rows: [after],
    } = await client.query('SELECT post_melt FROM orders.items WHERE id = $1', [fixture.itemId])
    assert.equal(after.post_melt, null)
  } finally {
    await cleanup(client, fixture)
  }
})

test('an empty patch is refused, and a line that does not exist is a 404', async () => {
  const fixture = await anOrderWithScrap(client)
  try {
    await assert.rejects(() => orders.editLine(fixture.itemId, {}), /names no field/)
    await assert.rejects(
      () => orders.editLine('00000000-0000-4000-8000-000000000000', { premium: 1 }),
      /no order item/
    )
  } finally {
    await cleanup(client, fixture)
  }
})
