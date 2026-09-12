import { test } from 'vitest'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import type { PoolClient } from 'pg'

import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser } from '#shared/testing/builders/index.ts'

// Migration 161 is the subject, so the test runs THE MIGRATION - not a
// re-implementation of its rule in TypeScript. A copy of the rule would pass
// while the file production runs says something else, which is the one failure
// a backfill test exists to prevent.
const MIGRATION = fs.readFileSync(
  path.join(
    import.meta.dirname,
    '..',
    '..',
    '..',
    '..',
    '..',
    'migrations',
    '161_backfill_lots_from_order_items.sql'
  ),
  'utf8'
)

const OPTIONS = { lock: [LOCKS.ORDERS, LOCKS.USERS], actor: TEST_ACTOR.id }

const run = (c: PoolClient): Promise<unknown> => c.query(MIGRATION)

type LineShape = {
  unit?: string
  pre_melt: number
  post_melt: number | null
  purity: number
  content: number
}

// The offending production row, to the digit: purchase order 270's silver line.
// Its content was computed from a purity of ~0.058542 that
// `exchange.scrap.purity numeric(4,3)` then rounded UP to 0.059, so the
// derivation says 0.259010 and the customer was paid on 0.257.
const ORDER_270_SILVER: LineShape = {
  unit: 't oz',
  pre_melt: 4.425,
  post_melt: 4.39,
  purity: 0.059,
  content: 0.257,
}

// A rounding residue rather than a defect: 70.449 g melted to 67.027 g at
// 0.255, stored rounded to three decimals at write time.
const A_ROUNDED_LINE: LineShape = {
  unit: 'g',
  pre_melt: 70.449,
  post_melt: 67.027,
  purity: 0.255,
  content: 0.55,
}

async function anUnbackfilledLine(
  c: PoolClient,
  line: LineShape,
  { settled }: { settled: boolean }
): Promise<{ order_id: string; item_id: string }> {
  const user = await aUser(c)
  const { rows } = await c.query<{ id: string }>(
    `INSERT INTO orders.orders (user_id, direction, status, number, spots_locked)
     VALUES ($1, 'purchase', 'Completed', nextval('orders.purchase_number_seq'), $2)
     RETURNING id`,
    [user.id, settled]
  )
  const order_id = rows[0]!.id
  if (settled) {
    await c.query(`INSERT INTO orders.transactions (order_id, total) VALUES ($1, 1000)`, [order_id])
  }
  const item = await c.query<{ id: string }>(
    `INSERT INTO orders.items
       (order_id, metal_id, unit, quantity, pre_melt, post_melt, purity, content, confirmed)
     VALUES ($1, 'Silver', $2, 1, $3, $4, $5, $6, true)
     RETURNING id`,
    [order_id, line.unit ?? 't oz', line.pre_melt, line.post_melt, line.purity, line.content]
  )
  return { order_id, item_id: item.rows[0]!.id }
}

const lotOf = async (c: PoolClient, id: string) => {
  const { rows } = await c.query<{ content: string | null; content_snapshot: string | null }>(
    `SELECT content, content_snapshot FROM lots.items WHERE id = $1`,
    [id]
  )
  return rows[0]
}

// THE RULE. An order that has been settled is a fact: the payout was computed
// from the content the line stored, the invoice printed it, and re-deriving it
// - even by a rounding residue - re-prices history.
test('a settled order’s lot keeps the fine weight its payout was computed from', async () => {
  await inPinnedTransaction(async (c) => {
    const { item_id } = await anUnbackfilledLine(c, ORDER_270_SILVER, { settled: true })

    await run(c)

    const lot = await lotOf(c, item_id)
    assert.equal(Number(lot?.content_snapshot), 0.257, 'the settled content was not snapshotted')
    assert.equal(Number(lot?.content), 0.257, 'the lot was re-priced by 0.002010 t oz')
  }, OPTIONS)
})

// The same defect on an order that can still be re-priced is a live one, and
// the gate that catches it has to survive the narrowing.
test('the same line on an OPEN order still stops the chain', async () => {
  await inPinnedTransaction(async (c) => {
    await anUnbackfilledLine(c, ORDER_270_SILVER, { settled: false })

    await c.query('BEGIN')
    await assert.rejects(run(c), /is a price change and not a rounding residue/)
    await c.query('ROLLBACK')
  }, OPTIONS)
})

// An open lot's content is GENERATED from its own weights through
// `metals.fine_content` - the stored value is only a cache of it, and a
// three-decimal residue is the derivation being the more precise of the two.
test('an open order’s lot generates its content and carries no snapshot', async () => {
  await inPinnedTransaction(async (c) => {
    const { item_id } = await anUnbackfilledLine(c, A_ROUNDED_LINE, { settled: false })

    await run(c)

    const lot = await lotOf(c, item_id)
    assert.equal(lot?.content_snapshot, null, 'an open lot must stay derivable')
    assert.ok(
      Math.abs(Number(lot?.content) - (67.027 / 31.1034768) * 0.255) < 1e-12,
      'the content did not come from metals.fine_content'
    )
    assert.notEqual(Number(lot?.content), 0.55, 'the stored rounding was copied instead')
  }, OPTIONS)
})

test('running it twice changes nothing', async () => {
  await inPinnedTransaction(async (c) => {
    const settled = await anUnbackfilledLine(c, ORDER_270_SILVER, { settled: true })
    const open = await anUnbackfilledLine(c, A_ROUNDED_LINE, { settled: false })

    await run(c)
    const first = { settled: await lotOf(c, settled.item_id), open: await lotOf(c, open.item_id) }
    await run(c)

    assert.deepEqual(await lotOf(c, settled.item_id), first.settled)
    assert.deepEqual(await lotOf(c, open.item_id), first.open)

    const { rows } = await c.query<{ links: string }>(
      `SELECT count(*) AS links FROM orders.lots WHERE lot_id = ANY($1::uuid[])`,
      [[settled.item_id, open.item_id]]
    )
    assert.equal(Number(rows[0]!.links), 2, 'a second run linked the lots again')
  }, OPTIONS)
})
