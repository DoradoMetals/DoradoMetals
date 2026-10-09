import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { LOCKS, takeLocks } from '#shared/testing/locks.ts'
import { inRollback } from '#shared/testing/rollback.ts'
import * as orderRead from '#orders/read.ts'

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

const saleIds = async (c?: PoolClient): Promise<string[]> =>
  (await orderRead.list({ direction: 'sale' }, c)).items.map((o) => o.id)

const viewsOf = async (ids: string[]) => {
  const out = []
  for (const id of ids) {
    const view = await orderRead.view(id)
    assert.ok(view, `order ${id} exists and the view could not read it`)
    out.push(view!)
  }
  return out
}

test('purchase orders and sales orders do not bleed into each other', async () => {
  const sales = await saleIds()
  const purchases = (await orderRead.list({ direction: 'purchase' })).items.map((o) => o.id)
  assert.ok(sales.length, 'no sales orders, so this proves nothing')
  assert.equal(
    sales.some((id) => purchases.includes(id)),
    false
  )

  await inRollback(async (c: PoolClient) => {
    const { rows } = await c.query(
      'SELECT direction, count(*)::int n FROM orders.orders WHERE id = ANY($1) GROUP BY 1',
      [sales]
    )
    assert.deepEqual(rows, [{ direction: 'sale', n: sales.length }])
  })
})

test('the money comes back off the transaction, not the order', async () => {
  await inRollback(async (c: PoolClient) => {
    const all = await viewsOf(await saleIds(c))
    assert.ok(all.length, 'no sales orders, so this test asserts nothing')
    for (const o of all) {
      const {
        rows: [t],
      } = await c.query(
        'SELECT total, items, shipping, surcharge, funds FROM orders.transactions WHERE order_id = $1',
        [o.order.id]
      )
      assert.ok(t, `sales order ${o.order.number} has no transaction row`)
      assert.equal(Number(o.totals!.total), Number(t.total))
      assert.equal(Number(o.totals!.items), Number(t.items))
      assert.equal(Number(o.totals!.shipping), Number(t.shipping))
      assert.equal(Number(o.totals!.surcharge), Number(t.surcharge))
      assert.equal(Number(o.totals!.funds), Number(t.funds))
    }
  })
})

test('used_funds stays a boolean beside the funds amount', async () => {
  const all = await viewsOf(await saleIds())
  assert.ok(all.length, 'no sales orders, so this test asserts nothing')
  for (const o of all) {
    assert.equal(typeof o.totals!.used_funds, 'boolean')
    assert.equal(typeof o.totals!.funds, 'number')
  }
})

test('the address is the snapshot the order links to', async () => {
  await inRollback(async (c: PoolClient) => {
    const { rows: links } = await c.query<{ order_id: string; address_id: string }>(
      `SELECT a.order_id, a.address_id FROM orders.addresses a
         JOIN orders.orders o ON o.id = a.order_id
        WHERE o.direction = 'sale' LIMIT 5`
    )
    assert.ok(links.length, 'no sales order has an address, so this proves nothing')
    for (const link of links) {
      const view = await orderRead.view(link.order_id)
      assert.ok(view?.address, `order ${link.order_id} has an address link and no address`)
      assert.equal(view!.address!.id, link.address_id)
    }
  })
})

test('every line names a product and carries its own metal', async () => {
  const all = await viewsOf(await saleIds())
  assert.ok(all.length, 'no sales orders, so this test asserts nothing')
  let lines = 0
  for (const o of all) {
    for (const item of o.lots) {
      lines += 1
      assert.ok(item.lot.bullion_id, `lot ${item.id} of a sale is not a bullion lot`)
      assert.ok(!('product' in item), `line ${item.id} still embeds the catalogue row`)
      assert.ok(item.lot.metal_id, `lot ${item.id} carries no metal of its own`)
    }
  }
  assert.ok(lines, 'no sales order had a single line, so this test asserts nothing')
})

test('orders come back newest first', async () => {
  const dates = (await orderRead.list({ direction: 'sale' })).items.map((o) =>
    new Date(o.created_at as unknown as string).getTime()
  )
  assert.deepEqual(
    dates,
    [...dates].sort((a, b) => b - a)
  )
})

test('reads do not write', async () => {
  await inRollback(async (c: PoolClient) => {
    await takeLocks(c, [LOCKS.ORDERS])
    const before = await c.query('SELECT count(*)::int n FROM orders.transactions')
    await viewsOf(await saleIds(c))
    const after = await c.query('SELECT count(*)::int n FROM orders.transactions')
    assert.equal(after.rows[0].n, before.rows[0].n)
  })
})
