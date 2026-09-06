// docs/model/lots.md section 6, in numbers. Every expectation is the one the
// write-up computed by hand, so this file is the oracle for the model: the lot
// id survives from the basket to the refiner, one customer order splits across
// two refiners, and the pool is a signed ledger nobody keeps a balance column
// for.
import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { LOCKS } from '#shared/testing/locks.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aUser, aProduct, anOrder } from '#shared/testing/builders/index.ts'
import * as refining from '#refining/service.ts'
import * as pricing from '#pricing/index.ts'

afterAll(async () => {
  await pool.end()
})

const EXACT = 1e-9
const close = (actual: unknown, expected: number, what: string) =>
  assert.ok(
    Math.abs(Number(actual) - expected) < EXACT,
    `${what}: ${actual} is not ${expected}`
  )

const refinerIds = async (c: PoolClient): Promise<string[]> => {
  const { rows } = await c.query<{ id: string }>(
    'SELECT id FROM refiners.refiners ORDER BY id LIMIT 2'
  )
  assert.ok(rows.length >= 1, 'the test database has no refiner')
  return rows.map((r) => r.id)
}

const inOrders = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS })

// 6.1: lots A (scrap gold), B (scrap silver) and C (2 pieces of product P).
const aMixedOrder = async (c: PoolClient) => {
  const seller = await aUser(c)
  const product = await aProduct(c, {
    metal_id: 'Gold',
    gross: 1,
    content: 0.999,
    purity: 0.999,
  })
  const order = await anOrder(c, seller, { direction: 'purchase' })
    .withLines(
      { metal_id: 'Gold', pre_melt: 10, purity: 0.9, unit: 't oz', premium: 0.9 },
      { metal_id: 'Silver', pre_melt: 100, purity: 0.925, unit: 't oz', premium: 0.85 }
    )
    .withBullion(product, 2, { premium: 0.95 })
    .withSpots({ bid: 2400, ask: 2500 })
    .withTotals({})
  // Frozen, so the quote prices at the order's own bid rather than the live
  // feed - 6.1 is written against a locked order.
  await c.query('UPDATE orders.orders SET spots_locked = true WHERE id = $1', [order.id])
  return { order, product }
}

const contentOf = async (c: PoolClient, lot_id: string): Promise<number> => {
  const { rows } = await c.query<{ content: string }>(
    'SELECT content FROM lots.items WHERE id = $1',
    [lot_id]
  )
  return Number(rows[0]!.content)
}

test("a lot's fine content is generated from its own weights, once", async () => {
  await inOrders(async (c) => {
    const { order, product } = await aMixedOrder(c)
    const [lotA, lotB, lotC] = order.lots
    close(await contentOf(c, lotA!.lot_id), 9, 'lot A: 10 t oz at 0.900')
    close(await contentOf(c, lotB!.lot_id), 92.5, 'lot B: 100 t oz at 0.925')
    // A catalogue lot never re-derives: its content is the product's own fine
    // content, snapshotted, so purity is not applied a second time.
    close(await contentOf(c, lotC!.lot_id), Number(product.content), 'lot C: the snapshot')
  })
})

test('the order view pays content x premium per lot, and prices the pieces', async () => {
  await inOrders(async (c) => {
    const { order, product } = await aMixedOrder(c)
    const priced = await pricing.priceOrder(order.id, c)
    const by = (link_id: string) => priced.items.find((line) => line.id === link_id)
    const [lotA, lotB, lotC] = order.lots

    // 9.000000 t oz x 0.900 = 8.100000 fine oz, at the order's frozen bid.
    close(by(lotA!.id)!.line_total, 9 * 0.9 * 2400, 'lot A pays 8.1 oz at 2400')
    // The silver lot prices at silver's own frozen bid: 92.5 fine oz at 0.850.
    const silver = by(lotB!.id)!
    close(silver.content, 92.5, "the silver lot's fine content")
    close(silver.premium, 0.85, "the silver lot's frozen premium")
    close(silver.line_total, 92.5 * 0.85 * 2400, 'silver is priced at its own frozen bid')
    // A bullion lot is priced PER PIECE and multiplied by the quantity.
    const bullion = by(lotC!.id)!
    close(bullion.line_total, bullion.unit_price * 2, 'the bullion lot is two pieces')
    close(bullion.content, Number(product.content), 'the bullion lot lost its snapshot')
  })
})

// The point of the whole model: `refiners.orders.order_id` could express
// neither of these, and dev held zero pooling because the column would not
// allow it.
test('one customer order splits across two refiner orders, keeping its lot ids', async () => {
  await inOrders(async (c) => {
    const { order } = await aMixedOrder(c)
    const [r1, r2] = await refinerIds(c)
    if (!r2) return

    const first = await refining.create({ refiner_id: r1!, direction: 'sell' })
    const second = await refining.create({ refiner_id: r2, direction: 'sell' })

    const [lotA, lotB, lotC] = order.lots
    await refining.assignLots(first.id, [lotA!.lot_id, lotC!.lot_id])
    await refining.assignLots(second.id, [lotB!.lot_id])

    const one = await refining.view(first.id)
    const two = await refining.view(second.id)
    assert.deepEqual(
      one.lots.map((l) => l.lot_id).sort(),
      [lotA!.lot_id, lotC!.lot_id].sort(),
      'the first refiner does not hold the lots it was given'
    )
    assert.deepEqual(two.lots.map((l) => l.lot_id), [lotB!.lot_id])

    // Both refiner orders name the SAME customer order, through the lot and
    // nothing else - no foreign key joins them (ruling 42).
    assert.equal(one.lots[0]!.order_number, order.number)
    assert.equal(two.lots[0]!.order_number, order.number)
  })
})

test('a lot goes to one refiner, and the second assignment is refused by name', async () => {
  await inOrders(async (c) => {
    const { order } = await aMixedOrder(c)
    const [r1, r2] = await refinerIds(c)
    if (!r2) return
    const first = await refining.create({ refiner_id: r1!, direction: 'sell' })
    const second = await refining.create({ refiner_id: r2, direction: 'sell' })
    await refining.assignLots(first.id, [order.lots[0]!.lot_id])
    await assert.rejects(
      () => refining.assignLots(second.id, [order.lots[0]!.lot_id]),
      /already on another refiner order/
    )
  })
})

// 6.1's settlement of #1001: lot A assays at 9.000000 fine and the refiner pays
// 0.950; lot C is bullion at 0.980 over 2 pieces. The pool credits are
// content x premium x quantity, and the balance is their sum.
test('settling a sell order credits the pool content x premium x pieces', async () => {
  await inOrders(async (c) => {
    const { order } = await aMixedOrder(c)
    const [r1] = await refinerIds(c)
    const engagement = await refining.create({ refiner_id: r1!, direction: 'sell' })
    const [lotA, , lotC] = order.lots
    await refining.assignLots(engagement.id, [lotA!.lot_id, lotC!.lot_id])
    await refining.send(engagement.id)

    const settled = await refining.settle(engagement.id, {
      fee: 7,
      statement_reference: 'R1-2026-09-14',
      lots: [
        { lot_id: lotA!.lot_id, post_melt: 10, purity: 0.9, unit: 't oz', premium: 0.95 },
        { lot_id: lotC!.lot_id, premium: 0.98 },
      ],
    })

    assert.equal(settled.state, 'Settled')
    assert.ok(settled.settled_at, 'the order settled without a timestamp')
    close(settled.fee, 7, 'the fee is one number in one place')
    assert.ok(
      settled.lots.every((l) => l.settled_at !== null),
      'a lot was left unsettled on a settled order'
    )

    const gold = settled.pool.find((p) => p.metal_id === 'Gold')
    assert.ok(gold, 'settling a sell order credited no gold to the pool')
    // lot A: 9.000000 x 0.950 = 8.550000
    // lot C: 0.999000 x 0.980 x 2 = 1.958040
    close(gold.troy_oz, 9 * 0.95 + 0.999 * 0.98 * 2, "R1's gold balance")
  })
})

test('the pool is a ledger: a lock is negative, and the balance is their sum', async () => {
  await inOrders(async (c) => {
    const { order } = await aMixedOrder(c)
    const [r1] = await refinerIds(c)
    const engagement = await refining.create({ refiner_id: r1!, direction: 'sell' })
    await refining.assignLots(engagement.id, [order.lots[0]!.lot_id])
    await refining.send(engagement.id)
    await refining.settle(engagement.id, {
      lots: [{ lot_id: order.lots[0]!.lot_id, premium: 0.95 }],
    })

    const before = (await refining.balances(r1!, 'Gold'))[0]
    assert.ok(before)

    const lock = await refining.lockFromPool({
      refiner_id: r1!,
      metal_id: 'Gold',
      troy_oz: 1,
      lock_price: 2450,
      refining_order_id: engagement.id,
    })
    assert.equal(lock.entry, 'lock')
    close(lock.troy_oz, -1, 'a lock takes metal out, so it is negative')

    const after = (await refining.balances(r1!, 'Gold'))[0]
    close(after!.troy_oz, Number(before.troy_oz) - 1, 'the balance is sum(troy_oz)')
    close(after!.last_lock_price, 2450, 'the last lock price is what the metal changed hands at')
  })
})

test('a refiner order that has been sent refuses new lots, and settles only once', async () => {
  await inOrders(async (c) => {
    const { order } = await aMixedOrder(c)
    const [r1] = await refinerIds(c)
    const engagement = await refining.create({ refiner_id: r1!, direction: 'sell' })
    const [lotA, lotB] = order.lots
    await refining.assignLots(engagement.id, [lotA!.lot_id])

    await assert.rejects(() => refining.settle(engagement.id, { lots: [] }), /has not been sent/)
    await refining.send(engagement.id)
    await assert.rejects(
      () => refining.assignLots(engagement.id, [lotB!.lot_id]),
      /has been sent and its lots cannot change/
    )
    await refining.settle(engagement.id, {
      lots: [{ lot_id: lotA!.lot_id, premium: 0.95 }],
    })
    await assert.rejects(
      () => refining.settle(engagement.id, { lots: [{ lot_id: lotA!.lot_id, premium: 0.9 }] }),
      /a correction is a new pool entry/
    )
  })
})

test('the settlement view sums estimated and settled fine oz, and their variance', async () => {
  await inOrders(async (c) => {
    const { order } = await aMixedOrder(c)
    const [r1] = await refinerIds(c)
    const engagement = await refining.create({ refiner_id: r1!, direction: 'sell' })
    await refining.assignLots(engagement.id, [order.lots[0]!.lot_id])
    await refining.send(engagement.id)

    // The refiner weighs the parcel HEAVIER than the customer declared: 10.5 t
    // oz at 0.9 instead of 10, so the variance is 0.45 fine oz in our favour.
    const settled = await refining.settle(engagement.id, {
      lots: [
        { lot_id: order.lots[0]!.lot_id, post_melt: 10.5, purity: 0.9, unit: 't oz', premium: 0.95 },
      ],
    })
    close(settled.estimated_content, 9, 'the declared fine oz')
    close(settled.settled_content, 10.5 * 0.9, 'the assayed fine oz')
    close(settled.variance, 10.5 * 0.9 - 9, 'the variance is settled minus estimated')
  })
})

test('an open sell order per refiner is the pooling mechanic, stated as an index', async () => {
  await inOrders(async (c) => {
    const [r1] = await refinerIds(c)
    const first = await refining.create({ refiner_id: r1!, direction: 'sell' })
    await assert.rejects(
      () => refining.create({ refiner_id: r1!, direction: 'sell' }),
      /is already open for this refiner/
    )
    // A BUY order is excluded from the index: several supplier orders may be
    // open at once.
    const buy = await refining.create({ refiner_id: r1!, direction: 'buy' })
    assert.notEqual(buy.id, first.id)
    await refining.create({ refiner_id: r1!, direction: 'buy' })
  })
})
