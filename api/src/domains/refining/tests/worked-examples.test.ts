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
  assert.ok(Math.abs(Number(actual) - expected) < EXACT, `${what}: ${actual} is not ${expected}`)

const refinerIds = async (c: PoolClient): Promise<string[]> => {
  const { rows } = await c.query<{ id: string }>(
    'SELECT id FROM refiners.refiners ORDER BY id LIMIT 2'
  )
  assert.ok(rows.length >= 1, 'the test database has no refiner')
  return rows.map((r) => r.id)
}

const inOrders = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS })

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
  await c.query('UPDATE orders.orders SET spots_locked = true WHERE id = $1', [order.id])
  return { order, product }
}

const contentOf = async (c: PoolClient, lot_id: string): Promise<number> => {
  const { rows } = await c.query<{ content: string }>(
    'SELECT content FROM inventory.lots WHERE id = $1',
    [lot_id]
  )
  return Number(rows[0]!.content)
}

const setSpot = async (c: PoolClient, metal_id: string, bid: number, ask: number): Promise<void> => {
  await c.query(
    `INSERT INTO spots.spots (metal_id, bid, ask) VALUES ($1, $2, $3)
       ON CONFLICT (metal_id) DO UPDATE SET bid = EXCLUDED.bid, ask = EXCLUDED.ask`,
    [metal_id, bid, ask]
  )
}

test("a lot's fine content is generated from its own weights, once", async () => {
  await inOrders(async (c) => {
    const { order, product } = await aMixedOrder(c)
    const [lotA, lotB, lotC] = order.lots
    close(await contentOf(c, lotA!.lot_id), 9, 'lot A: 10 t oz at 0.900')
    close(await contentOf(c, lotB!.lot_id), 92.5, 'lot B: 100 t oz at 0.925')
    close(await contentOf(c, lotC!.lot_id), Number(product.content), 'lot C: the snapshot')
  })
})

test('the order view pays content x premium per lot, and prices the pieces', async () => {
  await inOrders(async (c) => {
    const { order, product } = await aMixedOrder(c)
    const priced = await pricing.priceOrder(order.id, c)
    const by = (link_id: string) => priced.items.find((line) => line.id === link_id)
    const [lotA, lotB, lotC] = order.lots

    close(by(lotA!.id)!.line_total, 9 * 0.9 * 2400, 'lot A pays 8.1 oz at 2400')
    const silver = by(lotB!.id)!
    close(silver.content, 92.5, "the silver lot's fine content")
    close(silver.premium, 0.85, "the silver lot's frozen premium")
    close(silver.line_total, 92.5 * 0.85 * 2400, 'silver is priced at its own frozen bid')
    const bullion = by(lotC!.id)!
    close(bullion.line_total, bullion.unit_price * 2, 'the bullion lot is two pieces')
    close(bullion.content, Number(product.content), 'the bullion lot lost its snapshot')
  })
})

test('one customer order splits across two refiner orders, and each refiner lot names its source', async () => {
  await inOrders(async (c) => {
    const { order } = await aMixedOrder(c)
    const [r1, r2] = await refinerIds(c)
    if (!r2) return

    const first = await refining.create({ refiner_id: r1!, direction: 'sell' })
    const second = await refining.create({ refiner_id: r2, direction: 'sell' })

    const [lotA, lotB, lotC] = order.lots
    const firstAssigned = await refining.assignLots(first.id, [lotA!.lot_id, lotC!.lot_id])
    const secondAssigned = await refining.assignLots(second.id, [lotB!.lot_id])

    assert.equal(firstAssigned.length, 2)
    assert.equal(secondAssigned.length, 1)
    assert.ok(
      firstAssigned.every((row) => row.lot_id !== lotA!.lot_id && row.lot_id !== lotC!.lot_id),
      'assign minted no new refiner lot - it pointed straight at the customer lot'
    )

    const one = await refining.view(first.id)
    const two = await refining.view(second.id)
    assert.deepEqual(
      one.lots.flatMap((l) => l.sources.map((s) => s.id)).sort(),
      [lotA!.lot_id, lotC!.lot_id].sort(),
      'the first refiner does not source back to the lots it was given'
    )
    assert.deepEqual(
      two.lots.flatMap((l) => l.sources.map((s) => s.id)),
      [lotB!.lot_id]
    )

    assert.equal(one.lots[0]!.order_number, order.number)
    assert.equal(two.lots[0]!.order_number, order.number)
    assert.equal(two.lots[0]!.sources[0]!.share, null, 'a lot with one source has no share')
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

test('settling a sell order credits the pool content x premium x pieces', async () => {
  await inOrders(async (c) => {
    const { order } = await aMixedOrder(c)
    const [r1] = await refinerIds(c)
    const engagement = await refining.create({ refiner_id: r1!, direction: 'sell' })
    const [lotA, , lotC] = order.lots
    const assigned = await refining.assignLots(engagement.id, [lotA!.lot_id, lotC!.lot_id])
    await refining.send(engagement.id)

    const settled = await refining.settle(engagement.id, {
      fee: 7,
      statement_reference: 'R1-2026-09-14',
      lots: [
        { lot_id: assigned[0]!.lot_id, post_melt: 10, purity: 0.9, unit: 't oz', premium: 0.95 },
        { lot_id: assigned[1]!.lot_id, premium: 0.98 },
      ],
    })

    assert.equal(settled.state, 'Settled')
    assert.ok(settled.settled_at, 'the order settled without a timestamp')
    close(settled.fee, 7, 'the fee is one number in one place')
    assert.ok(
      settled.lots.every((l) => l.lot.settled_at !== null),
      'a lot was left unsettled on a settled order'
    )

    const gold = settled.pool.find((p) => p.metal_id === 'Gold')
    assert.ok(gold, 'settling a sell order credited no gold to the pool')
    close(gold.troy_oz, 9 * 0.95 + 0.999 * 0.98 * 2, "R1's gold balance")
    close(gold.balance, gold.troy_oz, 'balance is the credit side, and nothing has locked yet')
    close(gold.locked, 0, 'nothing has locked yet')
    close(gold.available, gold.balance - gold.locked, 'available nets balance and locked')
  })
})

test('the pool credit reads the refiner lot own figures, not the customer lot it came from', async () => {
  await inOrders(async (c) => {
    const { order } = await aMixedOrder(c)
    const [r1] = await refinerIds(c)
    const engagement = await refining.create({ refiner_id: r1!, direction: 'sell' })
    const [lotA] = order.lots
    const assigned = await refining.assignLots(engagement.id, [lotA!.lot_id])
    await refining.send(engagement.id)

    await refining.settle(engagement.id, {
      lots: [
        { lot_id: assigned[0]!.lot_id, post_melt: 20, purity: 0.5, unit: 't oz', premium: 0.4 },
      ],
    })

    const customerContent = await contentOf(c, lotA!.lot_id)
    close(customerContent, 9, "the customer lot's own content never moved")

    const gold = (await refining.balances(r1!, 'Gold'))[0]
    close(gold!.balance, 20 * 0.5 * 0.4, "the credit used the refiner lot's reported weight, not the customer's")
  })
})

test('the pool is a ledger: a lock is negative, and available is balance minus locked', async () => {
  await inOrders(async (c) => {
    const { order } = await aMixedOrder(c)
    const [r1] = await refinerIds(c)
    const engagement = await refining.create({ refiner_id: r1!, direction: 'sell' })
    const assigned = await refining.assignLots(engagement.id, [order.lots[0]!.lot_id])
    await refining.send(engagement.id)
    await refining.settle(engagement.id, {
      lots: [{ lot_id: assigned[0]!.lot_id, premium: 0.95 }],
    })

    const before = (await refining.balances(r1!, 'Gold'))[0]
    assert.ok(before)

    const lock = await refining.lockFromPool({
      refiner_id: r1!,
      metal_id: 'Gold',
      troy_oz: 1,
      lock_price: 2450,
      refining_order_id: engagement.id,
      purpose: 'Sell to refiner',
    })
    assert.equal(lock.entry, 'lock')
    assert.equal(lock.purpose, 'Sell to refiner')
    close(lock.troy_oz, -1, 'a lock takes metal out, so it is negative')

    const after = (await refining.balances(r1!, 'Gold'))[0]
    close(after!.troy_oz, Number(before.troy_oz) - 1, 'the balance is sum(troy_oz)')
    close(after!.last_lock_price, 2450, 'the last lock price is what the metal changed hands at')
    close(after!.balance, before.balance, 'a lock does not change what was ever credited')
    close(after!.locked, 1, 'the lock is one troy oz drawn out')
    close(after!.available, after!.balance - after!.locked, 'available nets balance and locked')
  })
})

test('a refiner order that has been sent warns about new lots, settles partially, and settles only once', async () => {
  await inOrders(async (c) => {
    const { order } = await aMixedOrder(c)
    const [r1] = await refinerIds(c)
    const engagement = await refining.create({ refiner_id: r1!, direction: 'sell' })
    const [lotA, lotB] = order.lots
    const firstAssigned = await refining.assignLots(engagement.id, [lotA!.lot_id])

    await assert.rejects(() => refining.settle(engagement.id, { lots: [] }), /has not been sent/)
    const sent = await refining.send(engagement.id)
    assert.match(
      sent.actions.find((a) => a.name === 'edit_lots')?.confirm ?? '',
      /has already been sent/,
      'a sent order offers edit_lots with a reason rather than refusing it'
    )
    assert.match(
      sent.actions.find((a) => a.name === 'settle')?.confirm ?? '',
      /are not settled/,
      'settle is offered with a reason before anything has settled'
    )
    const secondAssigned = await refining.assignLots(engagement.id, [lotB!.lot_id])

    const partial = await refining.settle(engagement.id, {
      lots: [{ lot_id: firstAssigned[0]!.lot_id, premium: 0.95 }],
    })
    assert.equal(partial.state, 'Settled', 'a partial settlement still closes the order')
    const [settledLot, unsettledLot] = [
      partial.lots.find((l) => l.lot_id === firstAssigned[0]!.lot_id)!,
      partial.lots.find((l) => l.lot_id === secondAssigned[0]!.lot_id)!,
    ]
    assert.ok(settledLot.lot.settled_at !== null, 'a named lot settled')
    assert.equal(unsettledLot.lot.settled_at, null, 'a partial settlement touched an unnamed lot')

    await assert.rejects(
      () =>
        refining.settle(engagement.id, {
          lots: [{ lot_id: secondAssigned[0]!.lot_id, premium: 0.95 }],
        }),
      /a correction is a new pool entry/,
      'settling is one event on the order - a second call corrects, it does not extend'
    )
  })
})

test('a settlement line naming a lot not on the order is refused', async () => {
  await inOrders(async (c) => {
    const { order } = await aMixedOrder(c)
    const [r1] = await refinerIds(c)
    const engagement = await refining.create({ refiner_id: r1!, direction: 'sell' })
    await refining.assignLots(engagement.id, [order.lots[0]!.lot_id])
    await refining.send(engagement.id)

    await assert.rejects(
      () =>
        refining.settle(engagement.id, {
          lots: [{ lot_id: order.lots[1]!.lot_id, premium: 0.9 }],
        }),
      /is not on this refiner order/
    )
  })
})

test('settled_spot is stamped server-side from the live spot on a paid order', async () => {
  await inOrders(async (c) => {
    const { order } = await aMixedOrder(c)
    const [r1] = await refinerIds(c)
    await setSpot(c, 'Gold', 2410, 2420)
    const engagement = await refining.create({
      refiner_id: r1!,
      direction: 'sell',
      settlement_type: 'paid',
    })
    const assigned = await refining.assignLots(engagement.id, [order.lots[0]!.lot_id])
    await refining.send(engagement.id)

    const settled = await refining.settle(engagement.id, {
      lots: [{ lot_id: assigned[0]!.lot_id, premium: 0.95 }],
    })
    close(
      settled.lots[0]!.lot.settled_spot,
      2410,
      'a silent line takes the live bid, not something the caller had to compute'
    )

    const spots = await refining.spotsFor(engagement.id)
    const gold = spots.find((s) => s.metal_id === 'Gold')!
    close(gold.spot, 2410, 'the spots read answers the settled spot of the settled lots')
    assert.equal(gold.lots, 1)
    assert.equal(gold.settled_lots, 1)
  })
})

test('a pooled order never carries a spot, and refuses one on a settlement line', async () => {
  await inOrders(async (c) => {
    const { order } = await aMixedOrder(c)
    const [r1] = await refinerIds(c)
    const engagement = await refining.create({ refiner_id: r1!, direction: 'sell' })
    assert.equal(engagement.settlement_type, 'pooled', 'pooled is the default settlement type')
    const assigned = await refining.assignLots(engagement.id, [order.lots[0]!.lot_id])
    await refining.send(engagement.id)

    await assert.rejects(
      () =>
        refining.settle(engagement.id, {
          lots: [{ lot_id: assigned[0]!.lot_id, premium: 0.95, settled_spot: 2400 }],
        }),
      /never carries a spot/
    )

    const settled = await refining.settle(engagement.id, {
      lots: [{ lot_id: assigned[0]!.lot_id, premium: 0.95 }],
    })
    assert.equal(settled.lots[0]!.lot.settled_spot, null, 'a pooled order stamped a spot anyway')

    const spots = await refining.spotsFor(engagement.id)
    assert.equal(spots[0]!.spot, null, 'the spots read reported one for a pooled order')
  })
})

test('the settlement view sums estimated and settled fine oz, and their variance', async () => {
  await inOrders(async (c) => {
    const { order } = await aMixedOrder(c)
    const [r1] = await refinerIds(c)
    const engagement = await refining.create({ refiner_id: r1!, direction: 'sell' })
    const assigned = await refining.assignLots(engagement.id, [order.lots[0]!.lot_id])
    await refining.send(engagement.id)

    const settled = await refining.settle(engagement.id, {
      lots: [
        {
          lot_id: assigned[0]!.lot_id,
          post_melt: 10.5,
          purity: 0.9,
          unit: 't oz',
          premium: 0.95,
        },
      ],
    })
    close(settled.estimated_content, 9, 'the declared fine oz')
    close(settled.settled_content, 10.5 * 0.9, 'the assayed fine oz')
    close(settled.variance, 10.5 * 0.9 - 9, 'the variance is settled minus estimated')
  })
})

test("linked_orders derives a buy order's sales through lots, with no stored order-to-order link", async () => {
  await inOrders(async (c) => {
    const buyer = await aUser(c)
    const product = await aProduct(c, { metal_id: 'Gold', gross: 1, content: 1, purity: 1 })
    const sale = await anOrder(c, buyer, { direction: 'sale' }).withBullion(product, 1)
    const [r1] = await refinerIds(c)

    const engagement = await refining.supplyOrder(sale.id, r1!)
    const held = await refining.lotsFor(engagement.id)
    assert.equal(held.length, 1)

    await c.query(
      `INSERT INTO inventory.lot_sources (lot_id, source_lot_id, kind) VALUES ($1, $2, 'sale')`,
      [sale.lots[0]!.lot_id, held[0]!.lot_id]
    )

    const view = await refining.view(engagement.id)
    assert.ok(
      view.linked_orders.some((row) => row.id === sale.id && row.direction === 'sale'),
      'a buy order does not name the sale its metal is bound for'
    )
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
    const buy = await refining.create({ refiner_id: r1!, direction: 'buy' })
    assert.notEqual(buy.id, first.id)
    await refining.create({ refiner_id: r1!, direction: 'buy' })
  })
})
