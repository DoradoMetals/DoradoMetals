import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { LOCKS } from '#shared/testing/locks.ts'
import * as orders from '#orders/service.ts'
import { asOrderLot } from '#orders/tests/order-lot.ts'

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
    `INSERT INTO orders.orders (direction, number)
     VALUES ('purchase', nextval('orders.purchase_number_seq'))
     RETURNING id`
  )
  const {
    rows: [lot],
  } = await c.query(
    `INSERT INTO inventory.lots (metal_id, pre_melt, purity, quantity, unit, premium)
     VALUES ($1, 10, 0.9, 1, 't oz', 0.75) RETURNING id`,
    [metal.id]
  )
  const {
    rows: [link],
  } = await c.query(`INSERT INTO orders.lots (order_id, lot_id) VALUES ($1, $2) RETURNING id`, [
    order.id,
    lot.id,
  ])
  return { orderId: order.id, itemId: link.id, lotId: lot.id }
}

const cleanup = async (c: PoolClient, { orderId }: { orderId: string }) => {
  const { rows: held } = await c.query<{ lot_id: string }>(
    'SELECT lot_id FROM orders.lots WHERE order_id = $1',
    [orderId]
  )
  for (const t of ['orders.lots', 'orders.spots', 'orders.transactions', 'orders.addresses']) {
    await c.query(`DELETE FROM ${t} WHERE order_id = $1`, [orderId])
  }
  if (held.length > 0) {
    await c.query('DELETE FROM inventory.lots WHERE id = ANY($1::uuid[])', [
      held.map((row) => row.lot_id),
    ])
  }
  await c.query('DELETE FROM orders.orders WHERE id = $1', [orderId])
}

const anEmptyGoldOrder = async (c: PoolClient) => {
  const {
    rows: [order],
  } = await c.query(
    `INSERT INTO orders.orders (direction, number)
     VALUES ('purchase', nextval('orders.purchase_number_seq'))
     RETURNING id`
  )
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

    const created = await orders.addLot(fixture.orderId, { bullion_id: product.id })

    assert.equal(
      Number(created.lot.premium),
      Number(product.bullion_pct),
      'the new bullion line did not come back at its band'
    )
    assert.notEqual(
      Number(created.lot.premium),
      Number(product.bid_premium),
      "the product's own bid_premium reached the order"
    )

    const {
      rows: [stored],
    } = await client.query('SELECT premium FROM inventory.lots WHERE id = $1', [created.lot_id])
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
    `INSERT INTO orders.orders (direction, number)
     VALUES ('purchase', nextval('orders.purchase_number_seq'))
     RETURNING id`
  )
  const fixture = { orderId: order.id }
  try {
    const {
      rows: [scrapLot],
    } = await client.query(
      `INSERT INTO inventory.lots (metal_id, pre_melt, purity, quantity, unit, premium)
       VALUES ($1, 5, 0.9, 1, 't oz', 0.75) RETURNING id`,
      [gold.id]
    )
    await client.query(`INSERT INTO orders.lots (order_id, lot_id) VALUES ($1, $2)`, [
      order.id,
      scrapLot.id,
    ])

    const product = await aGoldProductOffItsBand(client)
    const created = await orders.addLot(order.id, { bullion_id: product.id })

    const total = 4.5 + Number(product.content)
    const band = await bandFor(client, 'Gold', total)

    const {
      rows: [scrapNow],
    } = await client.query('SELECT premium FROM inventory.lots WHERE id = $1', [scrapLot.id])
    assert.equal(
      Number(scrapNow.premium),
      Number(band.scrap_pct),
      'the scrap was not re-tiered by the total the bullion added to'
    )
    assert.equal(
      Number(created.lot.premium),
      Number(band.bullion_pct),
      "the bullion line did not take the same band's bullion column"
    )
  } finally {
    await cleanup(client, fixture)
  }
})

test('deleting a link removes the lot with it', async () => {
  const fixture = await anOrderWithScrap(client)
  try {
    await orders.removeLot(fixture.itemId)

    const item = await client.query('SELECT 1 FROM orders.lots WHERE id = $1', [fixture.itemId])
    const refiner = await client.query('SELECT 1 FROM inventory.lots WHERE id = $1', [fixture.lotId])
    assert.equal(item.rows.length, 0, 'the order link survived')
    assert.equal(refiner.rows.length, 0, 'the refiner counterpart survived the cascade')
  } finally {
    await cleanup(client, fixture)
  }
})

test('a line that does not exist is refused and nothing is deleted', async () => {
  const fixture = await anOrderWithScrap(client)
  try {
    await assert.rejects(
      () => orders.removeLot('00000000-0000-4000-8000-000000000000'),
      /no order lot/
    )
    const item = await client.query('SELECT 1 FROM orders.lots WHERE id = $1', [fixture.itemId])
    assert.equal(item.rows.length, 1, 'a refused delete removed a different line')
  } finally {
    await cleanup(client, fixture)
  }
})

test('editing a scrap line writes the weights it names and derives the content', async () => {
  const fixture = await anOrderWithScrap(client)
  try {
    const edited = asOrderLot(
      await orders.editLot(fixture.itemId, {
        pre_melt: 10,
        post_melt: 8,
        purity: 0.5,
        unit: 't oz',
        premium: 0.82,
      })
    )

    assert.equal(Number(edited.lot.content), 4, '8 post-melt at 0.5 purity')
    assert.equal(Number(edited.lot.pre_melt), 10)
    assert.equal(Number(edited.lot.premium), 0.82)

    const {
      rows: [item],
    } = await client.query('SELECT content, premium FROM inventory.lots WHERE id = $1', [
      fixture.lotId,
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
    } = await client.query('SELECT premium FROM inventory.lots WHERE id = $1', [fixture.lotId])
    const edited = asOrderLot(await orders.editLot(fixture.itemId, { post_melt: 8, purity: 0.5 }))
    const band = await bandFor(client, 'Gold', Number(edited.lot.content))
    assert.equal(
      Number(
        (await client.query('SELECT premium FROM inventory.lots WHERE id = $1', [fixture.lotId]))
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
    } = await client.query('SELECT pre_melt, purity, unit FROM inventory.lots WHERE id = $1', [
      fixture.lotId,
    ])

    await orders.editLot(fixture.itemId, { post_melt: 8 })

    const {
      rows: [after],
    } = await client.query(
      'SELECT pre_melt, post_melt, purity, unit FROM inventory.lots WHERE id = $1',
      [fixture.lotId]
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
    await orders.editLot(fixture.itemId, { post_melt: null })
    const {
      rows: [after],
    } = await client.query('SELECT post_melt FROM inventory.lots WHERE id = $1', [fixture.lotId])
    assert.equal(after.post_melt, null)
  } finally {
    await cleanup(client, fixture)
  }
})

test('an empty patch is refused, and a line that does not exist is a 404', async () => {
  const fixture = await anOrderWithScrap(client)
  try {
    await assert.rejects(() => orders.editLot(fixture.itemId, {}), /names no field/)
    await assert.rejects(
      () => orders.editLot('00000000-0000-4000-8000-000000000000', { premium: 1 }),
      (error: Error & { kind?: string }) => error.kind === 'not_found'
    )
  } finally {
    await cleanup(client, fixture)
  }
})

const aProductWhosePurityWouldBite = async (c: PoolClient) => {
  const { rows } = await c.query(
    `SELECT id, name, gross, content, purity
       FROM products.bullion
      WHERE metal_id = 'Gold' AND content IS NOT NULL AND purity IS NOT NULL
        AND purity < 1 AND gross IS DISTINCT FROM content
      ORDER BY id
      LIMIT 1`
  )
  assert.ok(
    rows[0],
    'no gold product has a purity below 1 with a gross that differs from its ' +
      'content - this check would be vacuous'
  )
  return rows[0]
}

test('confirming a catalogue line leaves its content alone - the purity is applied once', async () => {
  const fixture = await anEmptyGoldOrder(client)
  try {
    const product = await aProductWhosePurityWouldBite(client)
    const created = await orders.addLot(fixture.orderId, { bullion_id: product.id })
    assert.equal(
      Number(created.lot.content),
      Number(product.content),
      "the snapshot did not take the product's own fine content"
    )

    const confirmed = asOrderLot(
      await orders.editLot(created.id, { confirmed_at: new Date().toISOString() })
    )
    assert.equal(
      Number(confirmed.lot.content),
      Number(product.content),
      `confirming ${product.name} moved its fine content from ${product.content} ` +
        `to ${confirmed.lot.content} - the purity was applied twice`
    )

    for (const patch of [{ premium: 1.02 }, { quantity: 2 }, { confirmed_at: null }]) {
      const again = asOrderLot(await orders.editLot(created.id, patch))
      assert.equal(
        Number(again.lot.content),
        Number(product.content),
        `${JSON.stringify(patch)} re-derived a catalogue line's content`
      )
    }

    const {
      rows: [stored],
    } = await client.query('SELECT content, post_melt FROM inventory.lots WHERE id = $1', [
      created.lot_id,
    ])
    assert.equal(Number(stored.content), Number(product.content))
    assert.equal(stored.post_melt, null, 'a fine weight is sitting in the gross-weight column')
  } finally {
    await cleanup(client, fixture)
  }
})

test('a scrap line still derives its content, from the weights the row ends up with', async () => {
  const fixture = await anOrderWithScrap(client)
  try {
    const confirmed = asOrderLot(
      await orders.editLot(fixture.itemId, { confirmed_at: new Date().toISOString() })
    )
    assert.equal(Number(confirmed.lot.content), 9, 'confirming a scrap line moved its content')

    const edited = asOrderLot(await orders.editLot(fixture.itemId, { post_melt: 8, purity: 0.5 }))
    assert.equal(Number(edited.lot.content), 4, '8 post-melt at 0.5 purity')
  } finally {
    await cleanup(client, fixture)
  }
})

test('a scrap line cannot be edited into a unit nobody quotes in', async () => {
  const fixture = await anOrderWithScrap(client)
  try {
    await assert.rejects(
      () => orders.editLot(fixture.itemId, { unit: 'kg' }),
      /cannot be valued/,
      'kg was accepted, and the line would have been worth zero fine ounces'
    )
    const {
      rows: [after],
    } = await client.query('SELECT unit, content FROM inventory.lots WHERE id = $1', [
      fixture.lotId,
    ])
    assert.equal(after.unit, 't oz', 'the refused edit still wrote the unit')
    assert.equal(Number(after.content), 9, 'the refused edit still moved the content')
  } finally {
    await cleanup(client, fixture)
  }
})
