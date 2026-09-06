import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import * as orderRead from '#orders/read.ts'
import * as spotsRepo from '#db/orders/spots/repo.ts'
import { LOCKS, takeLocks } from '#shared/testing/locks.ts'
import { rollbackIn } from '#shared/testing/rollback.ts'

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

const inRollback = rollbackIn({ lock: LOCKS.ORDERS })

const purchaseIds = async (c: PoolClient): Promise<string[]> =>
  (
    await c.query<{ id: string }>(
      `SELECT id FROM orders.orders WHERE direction = 'purchase' ORDER BY created_at DESC, id DESC`
    )
  ).rows.map((r) => r.id)

const viewsOf = async (ids: string[]) => {
  const out = []
  for (const id of ids) {
    const view = await orderRead.view(id)
    assert.ok(view, `order ${id} exists and the view could not read it`)
    out.push(view!)
  }
  return out
}

const VIEW_MEMBERS = [
  'order',
  'totals',
  'lots',
  'address',
  'shipments',
  'pickup',
  'payout',
  'user',
  'credited',
  'actions',
]

test('the order view carries exactly the members it declares', async () => {
  await inRollback(async (c: PoolClient) => {
    const [id] = await purchaseIds(c)
    assert.ok(id, 'no purchase orders - this proves nothing')
    const view = await orderRead.view(id)
    assert.ok(view)
    assert.deepEqual(Object.keys(view!).sort(), [...VIEW_MEMBERS].sort())
  })
})

test('the address is the snapshot the order took, not the book entry', async () => {
  await inRollback(async (c: PoolClient) => {
    const { rows: links } = await c.query<{
      order_id: string
      address_id: string
      source_address_id: string | null
    }>(
      `SELECT a.order_id, a.address_id, a.source_address_id
         FROM orders.addresses a
         JOIN orders.orders o ON o.id = a.order_id
        WHERE o.direction = 'purchase' LIMIT 5`
    )
    assert.ok(links.length, 'no purchase order has an address, so this proves nothing')

    for (const link of links) {
      const view = await orderRead.view(link.order_id)
      assert.ok(view?.address, `order ${link.order_id} has an address link and no address`)
      assert.equal(view!.address!.id, link.address_id, 'the view served a different row')
      if (link.source_address_id) {
        assert.notEqual(
          view!.address!.id,
          link.source_address_id,
          'the view served the BOOK row rather than the snapshot'
        )
      }
    }
  })
})

test('a line is a product line or a scrap line, and never both', async () => {
  await inRollback(async (c: PoolClient) => {
    const views = await viewsOf(await purchaseIds(c))
    const items = views.flatMap((v) => v.lots)
    assert.ok(items.length, 'no lines at all - this proves nothing')

    const bullion = items.filter((i) => i.lot.bullion_id !== null)
    const scrap = items.filter((i) => i.lot.bullion_id === null)
    assert.ok(bullion.length, 'no bullion lines, so half of this proves nothing')
    assert.ok(scrap.length, 'no scrap lines, so half of this proves nothing')

    for (const line of bullion) {
      assert.ok(!('product' in line), 'a bullion line still embeds the catalogue row')
      assert.ok(line.lot.metal_id, 'lots.items.metal_id is NOT NULL')
    }
    for (const line of scrap) {
      assert.ok(!('product' in line), 'a scrap line still embeds the catalogue row')
      assert.ok(line.lot.metal_id, 'lots.items.metal_id is NOT NULL')
    }
  })
})

test("the refiner's assay figures are not members of an order line", async () => {
  await inRollback(async (c: PoolClient) => {
    const views = await viewsOf(await purchaseIds(c))
    const items = views.flatMap((v) => v.lots)
    assert.ok(items.length, 'no lines at all - this proves nothing')
    for (const line of items) {
      for (const leaked of [
        'purity_actual',
        'post_melt_actual',
        'content_actual',
        'refiner_premium',
      ]) {
        assert.equal(leaked in line, false, `${leaked} is still riding on an order line`)
      }
    }
  })
})

test('no order view carries a full account or routing number', async () => {
  await inRollback(async (c: PoolClient) => {
    const views = await viewsOf(await purchaseIds(c))
    assert.ok(views.length > 0, 'no orders came back - this would prove nothing')

    const withPayout = views.filter((v) => v.payout)
    assert.ok(
      withPayout.length > 0,
      'no order carries a payout, so nothing here is checking a bank detail'
    )

    for (const v of withPayout) {
      assert.equal('account_number' in v.payout!, false)
      assert.equal('routing_number' in v.payout!, false)
      assert.ok('account_last4' in v.payout!, 'the last four did not travel')
    }
  })
})

test('the shipments are rows of one table, told apart by direction', async () => {
  await inRollback(async (c: PoolClient) => {
    const views = await viewsOf(await purchaseIds(c))
    const shipments = views.flatMap((v) => v.shipments)
    assert.ok(shipments.length, 'no shipments at all, so this proves nothing')
    for (const s of shipments) {
      assert.ok(typeof s.direction === 'string', 'a shipment has no direction')
      assert.equal('shipping_charge' in s, false, "the composer's rename survived")
      assert.ok('cost' in s, "the shipment's own cost column is missing")
    }
  })
})

test('no sales order leaks into a purchase order list', async () => {
  await inRollback(async (c: PoolClient) => {
    const ids = (await orderRead.list('purchase', null, c)).map((o) => o.id)
    const { rows } = await c.query(
      "SELECT id FROM orders.orders WHERE direction = 'sale' AND id = ANY($1)",
      [ids]
    )
    assert.deepEqual(rows, [])
  })
})

test('spot rows come back per metal with the shape the API returns', async () => {
  let spots: Awaited<ReturnType<typeof spotsRepo.getRowsFor>> = []
  for (const id of await purchaseIds(client)) {
    spots = await spotsRepo.getRowsFor(id)
    if (spots.length) break
  }
  assert.ok(spots.length, 'no purchase order has spot rows, so this asserts nothing')
  assert.deepEqual(Object.keys(spots[0]!).sort(), [
    'ask',
    'bid',
    'bullion_percentage',
    'created_at',
    'id',
    'metal_id',
    'order_id',
    'scrap_percentage',
    'updated_at',
  ])
  assert.deepEqual(
    spots.map((s) => s.metal_id),
    [...spots.map((s) => s.metal_id)].sort()
  )
})

test('reads do not write', async () => {
  await inRollback(async (c: PoolClient) => {
    const snapshot = async () =>
      (await c.query(`SELECT id, md5(o::text) AS sum FROM orders.orders o ORDER BY id`)).rows

    const before = await snapshot()
    assert.ok(before.length > 0, 'fixture: orders.orders must not be empty')
    await viewsOf(await purchaseIds(c))
    const after = new Map((await snapshot()).map((r) => [r.id, r.sum]))

    for (const row of before) {
      assert.ok(after.has(row.id), `the read removed order ${row.id}`)
      assert.equal(after.get(row.id), row.sum, `the read modified order ${row.id}`)
    }
  })
})
