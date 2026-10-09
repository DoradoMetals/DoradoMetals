import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { LOCKS } from '#shared/testing/locks.ts'
import { rollbackIn } from '#shared/testing/rollback.ts'
import {
  aUser,
  anOrder,
  aProduct,
  aRefiningOrder,
  aShipment,
  type BuiltOrder,
} from '#shared/testing/builders/index.ts'
import * as orders from '#db/orders/repo.ts'
import { OrderList } from '@dorado/contracts'

beforeAll(() => {
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
const EXACT = 1e-9

const BID = 100

async function lockSpots(c: PoolClient, order_id: string): Promise<void> {
  await c.query(`UPDATE orders.orders SET spots_locked = true WHERE id = $1`, [order_id])
}

// Every order in one test transaction is stamped `now()`, so a created_at sort
// would fall through to the uuid tiebreak and prove nothing. An UPDATE is safe:
// the audit trigger never touches created_at after the INSERT.
async function placedAt(c: PoolClient, order_id: string, at: string): Promise<void> {
  await c.query(`UPDATE orders.orders SET created_at = $1 WHERE id = $2`, [at, order_id])
}

// A purchase lot is `on hand` only once the handover has arrived (ruling 117),
// which is what makes it an UNASSIGNED lot rather than an incoming one.
async function arrived(c: PoolClient, order: BuiltOrder): Promise<void> {
  const parcel = await aShipment(c, order)
  await c.query(`UPDATE shipping.shipments SET delivered_at = now() WHERE id = $1`, [parcel.id])
}

// A lot only leaves `on hand` once the refiner has been TOLD about it: an
// unsent refiner order is a draft and the metal is still ours to assign.
async function sent(c: PoolClient, refining_order_id: string): Promise<void> {
  await c.query(`UPDATE refining.orders SET sent_at = now() WHERE id = $1`, [refining_order_id])
}

test('the list is one read, parsed through OrderList, with the counts beside the page', async () => {
  await inRollback(async (c: PoolClient) => {
    const owner = await aUser(c)
    const first = await anOrder(c, owner, { direction: 'purchase' })
      .withLines({ metal_id: 'Gold', content: 2, premium: 1 })
      .withSpots({ bid: BID })
      .withTotals({ total: 10 })
    const second = await anOrder(c, owner, { direction: 'purchase' })
      .withLines({ metal_id: 'Gold', content: 1, premium: 1 })
      .withSpots({ bid: BID })
    await arrived(c, first)
    await arrived(c, second)
    await placedAt(c, first.id, '2026-09-01T00:00:00Z')
    await placedAt(c, second.id, '2026-09-02T00:00:00Z')

    const raw = await orders.list({ user_id: owner.id }, c)
    const list = OrderList.parse(raw)

    assert.equal(list.counts.orders, 2, 'the count is over the filter, not the page')
    assert.equal(list.counts.unassigned_lots, 2, 'both lots are on hand and unassigned')
    assert.deepEqual(
      list.items.map((o) => o.id),
      [second.id, first.id],
      'the default sort is newest first'
    )
    assert.equal(list.items[0]!.reference, `PO-${second.number}`)
    assert.equal(list.items[0]!.state, 'Awaiting Payout')
    assert.equal(list.items[0]!.customer?.id, owner.id)
    assert.equal(list.items[1]!.totals?.total, 10, 'the transaction row did not nest')
  })
})

test('a card carries its lot count, up to three lot rows and the rest as more_count', async () => {
  await inRollback(async (c: PoolClient) => {
    const owner = await aUser(c)
    const order = await anOrder(c, owner, { direction: 'purchase' })
      .withLots(5, { metal_id: 'Gold', pre_melt: 12, purity: 0.5, unit: 'g' })
      .withSpots({ bid: BID })

    const list = await orders.list({ user_id: owner.id }, c)
    const card = list.items[0]!

    assert.equal(card.lot_count, 5, 'the card does not count every lot on the order')
    assert.equal(card.lots.length, 3, 'the card carries more than three lot rows')
    assert.equal(card.more_count, 2, 'more_count does not account for the lots left out')
    assert.deepEqual(
      card.lots.map((lot) => lot.reference),
      [`Lot ${order.number}-A`, `Lot ${order.number}-B`, `Lot ${order.number}-C`],
      'the lot rows are not the first three by seat'
    )
    assert.equal(card.lots[0]!.form, 'Scrap', 'a declared lot is not named Scrap')
    assert.equal(card.lots[0]!.product_name, null, 'a declared lot named a product')
    assert.equal(card.lots[0]!.purity, 0.5)
    assert.equal(card.lots[0]!.unit, 'g')
    assert.equal(card.lots[0]!.destination, null, 'an unassigned lot named a destination')
  })
})

test('a batched lot names its refiner order as the destination it is on', async () => {
  await inRollback(async (c: PoolClient) => {
    const owner = await aUser(c)
    const order = await anOrder(c, owner, { direction: 'purchase' })
      .withLines({ metal_id: 'Gold', content: 2, premium: 1 })
      .withSpots({ bid: BID })
    await arrived(c, order)
    const engagement = await aRefiningOrder(c, order)
    await sent(c, engagement.id)

    const list = await orders.list({ user_id: owner.id }, c)
    const card = list.items[0]!

    assert.equal(card.lots[0]!.destination, `RS-${engagement.number}`)
    assert.equal(list.counts.unassigned_lots, 0, 'a batched lot still counted as unassigned')
  })
})

test('estimated_value is the pricing expression over the lots, never a stored number', async () => {
  await inRollback(async (c: PoolClient) => {
    const owner = await aUser(c)
    const product = await aProduct(c, { metal_id: 'Gold', content: 1 })
    const order = await anOrder(c, owner, { direction: 'purchase' })
      .withLines(
        { metal_id: 'Gold', content: 2, premium: 1, quantity: 1 },
        { metal_id: 'Gold', content: 0.5, premium: 0.9, quantity: 1 },
        {
          metal_id: product.metal_id,
          bullion_id: product.id,
          content: product.content,
          premium: 0.8,
          quantity: 3,
        }
      )
      .withSpots({ bid: BID })
    await lockSpots(c, order.id)

    const list = await orders.list({ user_id: owner.id }, c)
    const expected = 2 * 1 * BID + 0.5 * 0.9 * BID + 1 * 0.8 * BID * 3

    assert.ok(
      Math.abs(list.items[0]!.estimated_value - expected) < EXACT,
      `estimated_value ${list.items[0]!.estimated_value} != hand-computed ${expected}`
    )
  })
})

test('the state filter matches the badge the same read projects', async () => {
  await inRollback(async (c: PoolClient) => {
    const owner = await aUser(c)
    const waiting = await anOrder(c, owner, { direction: 'purchase' })
      .withLines({ metal_id: 'Gold', content: 1, premium: 1 })
      .withSpots({ bid: BID })
    const cancelled = await anOrder(c, owner, {
      direction: 'purchase',
      cancelled_at: new Date().toISOString(),
    }).withLines({ metal_id: 'Gold', content: 1, premium: 1 })

    const open = await orders.list({ user_id: owner.id, states: ['Awaiting Receipt'] }, c)
    assert.deepEqual(
      open.items.map((o) => o.id),
      [waiting.id]
    )
    assert.equal(open.counts.orders, 1, 'the count ignored the state filter')

    const gone = await orders.list({ user_id: owner.id, states: ['Cancelled'] }, c)
    assert.deepEqual(
      gone.items.map((o) => o.id),
      [cancelled.id]
    )

    const both = await orders.list(
      { user_id: owner.id, states: ['Awaiting Receipt', 'Cancelled'] },
      c
    )
    assert.equal(both.counts.orders, 2, 'a repeated state did not widen the filter')
  })
})

test('assigned_to_id filters, and unassigned is the orders nobody owns', async () => {
  await inRollback(async (c: PoolClient) => {
    const owner = await aUser(c)
    const employee = await aUser(c)
    const mine = await anOrder(c, owner, { direction: 'purchase' }).withLots(1)
    const nobodys = await anOrder(c, owner, { direction: 'purchase' }).withLots(1)
    await c.query(`UPDATE orders.orders SET assigned_to_id = $1 WHERE id = $2`, [
      employee.id,
      mine.id,
    ])

    const theirs = await orders.list({ user_id: owner.id, assigned_to_id: employee.id }, c)
    assert.deepEqual(
      theirs.items.map((o) => o.id),
      [mine.id]
    )

    const loose = await orders.list({ user_id: owner.id, unassigned: true }, c)
    assert.deepEqual(
      loose.items.map((o) => o.id),
      [nobodys.id]
    )
  })
})

test('has_unassigned_lots keeps only the orders with a lot still on hand', async () => {
  await inRollback(async (c: PoolClient) => {
    const owner = await aUser(c)
    const loose = await anOrder(c, owner, { direction: 'purchase' })
      .withLines({ metal_id: 'Gold', content: 1, premium: 1 })
      .withSpots({ bid: BID })
    const batched = await anOrder(c, owner, { direction: 'purchase' })
      .withLines({ metal_id: 'Gold', content: 1, premium: 1 })
      .withSpots({ bid: BID })
    await arrived(c, loose)
    await arrived(c, batched)
    await sent(c, (await aRefiningOrder(c, batched)).id)

    const list = await orders.list({ user_id: owner.id, has_unassigned_lots: true }, c)
    assert.deepEqual(
      list.items.map((o) => o.id),
      [loose.id]
    )
    assert.equal(list.counts.orders, 1)
    assert.equal(list.counts.unassigned_lots, 1)
  })
})

test('a sort key is a row, and it orders the page without touching the counts', async () => {
  await inRollback(async (c: PoolClient) => {
    const owner = await aUser(c)
    const small = await anOrder(c, owner, { direction: 'purchase' })
      .withLines({ metal_id: 'Gold', content: 1, premium: 1 })
      .withSpots({ bid: BID })
    const big = await anOrder(c, owner, { direction: 'purchase' })
      .withLines({ metal_id: 'Gold', content: 9, premium: 1 })
      .withSpots({ bid: BID })
    await lockSpots(c, small.id)
    await lockSpots(c, big.id)
    await placedAt(c, small.id, '2026-09-01T00:00:00Z')
    await placedAt(c, big.id, '2026-09-02T00:00:00Z')

    const offered = await orders.sorts(c)
    assert.ok(
      offered.some((row) => row.key === 'newest'),
      'orders.list_sorts holds no newest row - migration 260 did not seed'
    )
    assert.equal(offered[0]!.key, 'newest', 'the lowest sort_order is not the default')

    const oldest = await orders.list({ user_id: owner.id, sort: 'oldest' }, c)
    assert.deepEqual(
      oldest.items.map((o) => o.id),
      [small.id, big.id]
    )

    const highest = await orders.list({ user_id: owner.id, sort: 'value_high' }, c)
    assert.deepEqual(
      highest.items.map((o) => o.id),
      [big.id, small.id]
    )

    const lowest = await orders.list({ user_id: owner.id, sort: 'value_low' }, c)
    assert.deepEqual(
      lowest.items.map((o) => o.id),
      [small.id, big.id]
    )
    assert.equal(lowest.counts.orders, 2, 'a sort changed the count')
  })
})

test('limit and offset page the items and leave the counts whole', async () => {
  await inRollback(async (c: PoolClient) => {
    const owner = await aUser(c)
    const first = await anOrder(c, owner, { direction: 'purchase' }).withLots(1)
    const second = await anOrder(c, owner, { direction: 'purchase' }).withLots(1)
    const third = await anOrder(c, owner, { direction: 'purchase' }).withLots(1)
    await placedAt(c, first.id, '2026-09-01T00:00:00Z')
    await placedAt(c, second.id, '2026-09-02T00:00:00Z')
    await placedAt(c, third.id, '2026-09-03T00:00:00Z')

    const page = await orders.list({ user_id: owner.id, limit: 2 }, c)
    assert.deepEqual(
      page.items.map((o) => o.id),
      [third.id, second.id]
    )
    assert.equal(page.counts.orders, 3, 'a page shrank the count')

    const next = await orders.list({ user_id: owner.id, limit: 2, offset: 2 }, c)
    assert.deepEqual(
      next.items.map((o) => o.id),
      [first.id]
    )
    assert.equal(next.counts.orders, 3)
  })
})

test('placed_at is the order, arrived_at is the handover, and neither is invented', async () => {
  await inRollback(async (c: PoolClient) => {
    const owner = await aUser(c)
    const order = await anOrder(c, owner, { direction: 'purchase' }).withLots(1)
    const parcel = await aShipment(c, order)

    const before = await orders.list({ user_id: owner.id }, c)
    assert.equal(before.items[0]!.arrived_at, null, 'an undelivered parcel reported an arrival')
    assert.equal(
      before.items[0]!.placed_at,
      before.items[0]!.created_at,
      'placed_at is not when the order was placed'
    )

    await c.query(`UPDATE shipping.shipments SET delivered_at = $1 WHERE id = $2`, [
      '2026-09-02T10:00:00Z',
      parcel.id,
    ])

    const after = await orders.list({ user_id: owner.id }, c)
    assert.equal(after.items[0]!.arrived_at, '2026-09-02T10:00:00.000Z')
    assert.equal(after.items[0]!.state, 'Awaiting Payout', 'the arrival did not move the state')
  })
})
