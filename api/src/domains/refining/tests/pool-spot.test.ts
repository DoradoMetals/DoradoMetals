import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { LOCKS } from '#shared/testing/locks.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aUser, anOrder } from '#shared/testing/builders/index.ts'
import * as refining from '#refining/service.ts'
import * as pricing from '#pricing/index.ts'

afterAll(async () => {
  await pool.end()
})

const EXACT = 1e-6
const close = (actual: unknown, expected: number, what: string): void =>
  assert.ok(Math.abs(Number(actual) - expected) < EXACT, `${what}: ${actual} is not ${expected}`)

const METALS = ['Platinum', 'Palladium', 'Silver', 'Gold']

const aFreshRefinerMetal = async (c: PoolClient): Promise<{ refiner_id: string; metal_id: string }> => {
  const { rows } = await c.query<{ id: string }>('SELECT id FROM refiners.refiners ORDER BY id')
  assert.ok(rows.length >= 1, 'the test database has no refiner')
  for (const refiner_id of rows.map((r) => r.id)) {
    for (const metal_id of METALS) {
      const { rows: used } = await c.query(
        'SELECT 1 FROM inventory.pool WHERE refiner_id = $1 AND metal_id = $2 LIMIT 1',
        [refiner_id, metal_id]
      )
      if (used.length === 0) return { refiner_id, metal_id }
    }
  }
  throw new Error('every refiner and metal already carries pool activity')
}

const inOrders = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS })

const setSpot = async (c: PoolClient, metal_id: string, bid: number, ask: number): Promise<void> => {
  await c.query(
    `INSERT INTO spots.spots (metal_id, bid, ask) VALUES ($1, $2, $3)
       ON CONFLICT (metal_id) DO UPDATE SET bid = EXCLUDED.bid, ask = EXCLUDED.ask`,
    [metal_id, bid, ask]
  )
}

const aPurchaseOrder = async (
  c: PoolClient,
  metal_id: string,
  pre_melt: number,
  purity: number,
  premium: number,
  bid: number,
  ask: number
) => {
  const seller = await aUser(c)
  const order = await anOrder(c, seller, { direction: 'purchase' })
    .withLines({ metal_id, pre_melt, purity, unit: 't oz', premium })
    .withSpots({ bid, ask })
    .withTotals({})
  await c.query('UPDATE orders.orders SET spots_locked = true WHERE id = $1', [order.id])
  return order
}

test('a pool credit carries the settlement spot, and a lock snapshots the basis it draws against', async () => {
  await inOrders(async (c) => {
    const { refiner_id, metal_id } = await aFreshRefinerMetal(c)
    const order = await aPurchaseOrder(c, metal_id, 10, 0.9, 0.9, 2300, 2310)

    const engagement = await refining.create({ refiner_id, direction: 'sell' })
    const assigned = await refining.assignLots(engagement.id, [order.lots[0]!.lot_id])
    await refining.send(engagement.id)

    await setSpot(c, metal_id, 2400, 2410)
    await refining.settle(engagement.id, { lots: [{ lot_id: assigned[0]!.lot_id }] })

    const credits = await refining.entries(refiner_id, metal_id, 'credit')
    assert.equal(credits.length, 1)
    const credit = credits[0]!
    close(credit.spot!, 2400, 'the credit did not carry the settlement spot')
    assert.equal(credit.gain, null, 'a credit row answered a gain, which only a lock has')
    close(credit.troy_oz, 8.1, 'content x premium credited to the pool')

    const locked = await refining.lockFromPool({
      refiner_id,
      metal_id,
      troy_oz: credit.troy_oz,
      lock_price: 2500,
      purpose: 'Sell to refiner',
      refining_order_id: engagement.id,
    })
    close(locked.basis_spot!, 2400, 'the lock did not snapshot the pool basis at draw time')

    const entries = await refining.entries(refiner_id, metal_id, 'lock')
    close(entries[0]!.gain!, credit.troy_oz * 100, 'gain is oz times (lock price minus basis)')

    const [balance] = await refining.balances(refiner_id, metal_id)
    close(balance!.basis!, 2400, 'the pool basis is the weighted-average credit spot')
    close(balance!.available, 0, 'the one credit was fully drawn by the one lock')
    close(balance!.realised_gain, credit.troy_oz * 100, 'realised_gain did not sum the lock gains')
    close(balance!.unrealised_gain!, 0, 'nothing remains in the pool to value at the live spot')
  })
})

test('reconciliation: order profit plus pool realised gains equals cash in minus cash out', async () => {
  await inOrders(async (c) => {
    const { refiner_id, metal_id } = await aFreshRefinerMetal(c)

    const orderA = await aPurchaseOrder(c, metal_id, 10, 0.9, 0.9, 2300, 2310)
    const orderB = await aPurchaseOrder(c, metal_id, 20, 0.925, 0.85, 2320, 2330)

    const engagement = await refining.create({ refiner_id, direction: 'sell' })
    const assigned = await refining.assignLots(engagement.id, [
      orderA.lots[0]!.lot_id,
      orderB.lots[0]!.lot_id,
    ])
    await refining.send(engagement.id)

    await setSpot(c, metal_id, 2400, 2410)
    await refining.settle(engagement.id, {
      lots: assigned.map((lot) => ({ lot_id: lot.lot_id })),
    })

    const priceA = await pricing.priceOrder(orderA.id, c)
    const priceB = await pricing.priceOrder(orderB.id, c)
    const cashOut = priceA.items[0]!.line_total + priceB.items[0]!.line_total

    const credits = await refining.entries(refiner_id, metal_id, 'credit')
    assert.equal(credits.length, 1, 'both orders settled together into one credit')
    const troyOz = credits[0]!.troy_oz
    const settledSpot = credits[0]!.spot!

    const orderProfitA = 9 * 0.9 * (settledSpot - 2300)
    const orderProfitB = 18.5 * 0.85 * (settledSpot - 2320)

    const draws = [
      { troy_oz: 10, lock_price: 2500 },
      { troy_oz: 8, lock_price: 2350 },
      { troy_oz: troyOz - 18, lock_price: 2600 },
    ]
    let cashIn = 0
    let realisedGain = 0
    for (const draw of draws) {
      const locked = await refining.lockFromPool({
        refiner_id,
        metal_id,
        troy_oz: draw.troy_oz,
        lock_price: draw.lock_price,
        purpose: 'Sell to refiner',
        refining_order_id: engagement.id,
      })
      cashIn += draw.troy_oz * draw.lock_price
      realisedGain += draw.troy_oz * (draw.lock_price - locked.basis_spot!)
    }

    const [balance] = await refining.balances(refiner_id, metal_id)
    close(balance!.available, 0, 'the three withdrawals did not fully drain the credit')
    close(balance!.realised_gain, realisedGain, 'the balance read did not sum the same gains')

    close(
      orderProfitA + orderProfitB + realisedGain,
      cashIn - cashOut,
      'order profit plus realised pool gains did not reconcile to cash in minus cash out'
    )
  })
})
