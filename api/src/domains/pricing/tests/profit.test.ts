import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { LOCKS } from '#shared/testing/locks.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import {
  aUser,
  anOrder,
  aProduct,
  aShipment,
  aPayout,
  aRefiningOrder,
  anUnknownId,
} from '#shared/testing/builders/index.ts'
import * as totalsRepo from '#db/orders/transactions/repo.ts'
import * as refiningOrdersRepo from '#db/refining/orders/repo.ts'
import * as refiningLotsRepo from '#db/refining/lots/repo.ts'
import * as lotSourcesRepo from '#db/inventory/lot-sources/repo.ts'
import { profitBreakdown } from '#pricing/service.ts'
import * as refining from '#refining/service.ts'
import type { ProfitBreakdown } from '@dorado/contracts'

const EXACT = 1e-9

afterAll(async () => {
  await pool.end()
})

const shareOf = (b: ProfitBreakdown, category: string, party: string, metal_id: string) =>
  b.shares.find((s) => s.category === category && s.party === party && s.metal_id === metal_id)

const partyOf = (b: ProfitBreakdown, party: string) => b.parties.find((p) => p.party === party)

function close(actual: number | undefined, expected: number, what: string): void {
  assert.ok(actual !== undefined, `${what} is missing from the breakdown`)
  assert.ok(Math.abs(actual - expected) < EXACT, `${what} is ${actual}, hand-computed ${expected}`)
}

test('a purchase order splits every line three ways, per metal and per category', async () => {
  await inPinnedTransaction(
    async (c) => {
      const seller = await aUser(c)
      const product = await aProduct(c, { metal_id: 'Gold', content: 2 })

      const order = await anOrder(c, seller, { direction: 'purchase' })
        .withLines(
          { metal_id: 'Gold', content: 10, premium: 0.9, quantity: 1 },
          {
            metal_id: 'Gold',
            bullion_id: product.id,
            content: 2,
            premium: 0.95,
            quantity: 3,
          }
        )
        .withSpots({ bid: 100, ask: 200 })
        .withTotals({})

      const [scrapLine, bullionLine] = order.lots

      await totalsRepo.update(order.id, { shipping_fee_actual: 10 }, {}, c)
      await aPayout(c, seller, { order, payout_fee: 20 })
      await aShipment(c, order, { cost: 24.5 })

      const engagement = await aRefiningOrder(c, order, {
        lock: { metal_id: 'Gold', troy_oz: 1, lock_price: 120 },
      })
      await refiningOrdersRepo.update(engagement.id, { fee: 7 }, c)
      const assayed = await refiningLotsRepo.getFor(engagement.id, c)
      const edges = await lotSourcesRepo.sourcesOf(
        [scrapLine!.lot_id, bullionLine!.lot_id],
        c
      )
      const refinerLotFor = (customerLotId: string) =>
        edges.find((edge) => edge.source_lot_id === customerLotId && edge.kind === 'batch')!
          .lot_id
      const scrapAssay = assayed.find((row) => row.lot_id === refinerLotFor(scrapLine!.lot_id))!
      const bullionAssay = assayed.find(
        (row) => row.lot_id === refinerLotFor(bullionLine!.lot_id)
      )!
      await refiningLotsRepo.update(
        scrapAssay.id,
        { post_melt: 10.5, purity: 1, unit: 't oz', premium: 0.94 },
        c
      )
      await refiningLotsRepo.update(bullionAssay.id, { premium: 0.98 }, c)

      const b = await profitBreakdown(order.id)

      assert.equal(b.order_id, order.id)
      assert.ok(!Number.isNaN(Date.parse(b.spots_at)), 'spots_at is not a timestamp')
      assert.equal(b.total_lots, 2, 'both lots went to a refiner')
      assert.equal(b.settled_lots, 0, 'neither refiner lot carries a settled_spot')
      assert.equal(b.basis, 'estimated', 'an unsettled lot makes the whole order estimated')
      assert.equal(b.shares.length, 9, 'three parties x three categories, one metal')
      assert.equal(b.parties.length, 3)
      assert.deepEqual(
        [...new Set(b.shares.map((s) => s.metal_id))],
        ['Gold'],
        'a metal with no line in the order got a row anyway'
      )

      close(shareOf(b, 'scrap', 'customer', 'Gold')?.content, 9, 'scrap customer content')
      close(shareOf(b, 'scrap', 'customer', 'Gold')?.profit, 900, 'scrap customer profit')
      close(shareOf(b, 'scrap', 'refiner', 'Gold')?.content, 0.63, 'scrap refiner content')
      close(shareOf(b, 'scrap', 'refiner', 'Gold')?.profit, 75.6, 'scrap refiner profit')
      close(shareOf(b, 'scrap', 'dorado', 'Gold')?.content, 0.87, 'scrap dorado content')
      close(shareOf(b, 'scrap', 'dorado', 'Gold')?.profit, 104.4, 'scrap dorado profit')
      close(shareOf(b, 'scrap', 'refiner', 'Gold')?.percentage, 6, 'scrap refiner percentage')

      close(shareOf(b, 'bullion', 'customer', 'Gold')?.content, 5.7, 'bullion customer content')
      close(shareOf(b, 'bullion', 'customer', 'Gold')?.profit, 570, 'bullion customer profit')
      close(shareOf(b, 'bullion', 'refiner', 'Gold')?.content, 0.12, 'bullion refiner content')
      close(shareOf(b, 'bullion', 'dorado', 'Gold')?.content, 0.18, 'bullion dorado content')
      close(
        shareOf(b, 'bullion', 'customer', 'Gold')?.percentage,
        95,
        'bullion customer percentage'
      )
      close(shareOf(b, 'bullion', 'refiner', 'Gold')?.percentage, 2, 'bullion refiner percentage')

      close(shareOf(b, 'total', 'customer', 'Gold')?.content, 14.7, 'total customer content')
      close(shareOf(b, 'total', 'customer', 'Gold')?.profit, 1470, 'total customer profit')
      close(shareOf(b, 'total', 'dorado', 'Gold')?.content, 1.05, 'total dorado content')
      close(shareOf(b, 'total', 'dorado', 'Gold')?.profit, 126, 'total dorado profit')
      close(shareOf(b, 'total', 'refiner', 'Gold')?.content, 0.75, 'total refiner content')
      close(shareOf(b, 'total', 'refiner', 'Gold')?.profit, 90, 'total refiner profit')

      for (const category of ['scrap', 'bullion', 'total']) {
        const rows = b.shares.filter((s) => s.category === category)
        close(
          rows.reduce((sum, r) => sum + r.percentage, 0),
          100,
          `${category} percentages do not sum to 100`
        )
      }

      close(partyOf(b, 'customer')?.shipping_net, -14.5, 'customer shipping_net')
      close(partyOf(b, 'customer')?.refiner_fee_net, -20, 'customer refiner_fee_net')
      close(partyOf(b, 'customer')?.spot_net, 0, 'customer spot_net')
      close(partyOf(b, 'customer')?.total_profit, 1425.5, 'customer total_profit')

      close(partyOf(b, 'dorado')?.metals_profit, 126, 'dorado metals_profit')
      close(partyOf(b, 'dorado')?.shipping_net, 14.5, 'dorado shipping_net')
      close(partyOf(b, 'dorado')?.refiner_fee_net, -7, 'dorado refiner_fee_net')
      close(partyOf(b, 'dorado')?.spot_net, 294, 'dorado spot_net')
      close(partyOf(b, 'dorado')?.total_profit, 427.5, 'dorado total_profit')

      close(partyOf(b, 'refiner')?.shipping_net, 0, 'refiner shipping_net')
      close(partyOf(b, 'refiner')?.refiner_fee_net, 0, 'refiner refiner_fee_net')
      close(partyOf(b, 'refiner')?.spot_net, 0, 'refiner spot_net')
      close(partyOf(b, 'refiner')?.total_profit, 90, 'refiner total_profit')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test("a scrap line with no premium of its own takes the band the order's ounces earn", async () => {
  await inPinnedTransaction(
    async (c) => {
      const { rows } = await c.query<{ scrap_pct: number }>(
        `SELECT r.scrap_pct FROM rates.rates r
        WHERE r.metal_id = 'Gold'
          AND 10 >= r.min_qty AND (r.max_qty IS NULL OR 10 <= r.max_qty)
        ORDER BY r.min_qty ASC LIMIT 1`
      )
      const band = Number(rows[0]?.scrap_pct)
      assert.ok(band > 0, 'the test database has no Gold rate band containing 10 oz')

      const seller = await aUser(c)
      const order = await anOrder(c, seller, { direction: 'purchase' })
        .withLines({ metal_id: 'Gold', content: 10, quantity: 1 })
        .withSpots({ bid: 100, ask: 200 })
        .withTotals({})
      await aRefiningOrder(c, order, {
        lock: { metal_id: 'Gold', troy_oz: 1, lock_price: 120 },
      })

      const b = await profitBreakdown(order.id)

      close(shareOf(b, 'total', 'customer', 'Gold')?.content, 10 * band, 'customer content')
      close(shareOf(b, 'total', 'refiner', 'Gold')?.content, 10 * (1 - band), 'refiner content')
      close(shareOf(b, 'total', 'dorado', 'Gold')?.content, 0, 'dorado content')
      close(shareOf(b, 'total', 'customer', 'Gold')?.profit, 10 * band * 100, 'customer profit')
      close(shareOf(b, 'total', 'refiner', 'Gold')?.profit, 10 * (1 - band) * 120, 'refiner profit')
      close(partyOf(b, 'dorado')?.spot_net, 10 * band * 20, 'dorado spot_net')
      close(partyOf(b, 'dorado')?.total_profit, 10 * band * 20, 'dorado total_profit')
      assert.equal(
        b.shares.filter((s) => s.category === 'bullion').length,
        0,
        'an order with no product line reported bullion rows'
      )
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('a sale has no refiner: the customer owns all of it and Dorado keeps the carriage', async () => {
  await inPinnedTransaction(
    async (c) => {
      const buyer = await aUser(c)
      const product = await aProduct(c, { metal_id: 'Gold', content: 1 })

      const order = await anOrder(c, buyer, { direction: 'sale' })
        .withLines({
          metal_id: 'Gold',
          bullion_id: product.id,
          content: 1,
          premium: 1.05,
          quantity: 2,
        })
        .withSpots({ bid: 100, ask: 200 })
        .withTotals({})
      await totalsRepo.update(order.id, { shipping_fee_actual: 5 }, {}, c)
      await aShipment(c, order, { cost: 12 })

      const b = await profitBreakdown(order.id)

      assert.equal(b.total_lots, 0, 'a sale with no refiner lot has nothing pending')
      assert.equal(b.settled_lots, 0)
      assert.equal(b.basis, 'realized', 'nothing outstanding is realized by default')

      close(shareOf(b, 'total', 'customer', 'Gold')?.content, 2, 'customer content')
      close(shareOf(b, 'total', 'customer', 'Gold')?.percentage, 100, 'customer percentage')
      close(shareOf(b, 'total', 'customer', 'Gold')?.profit, 200, 'customer profit')
      close(shareOf(b, 'total', 'dorado', 'Gold')?.content, 0, 'dorado content')
      close(shareOf(b, 'total', 'refiner', 'Gold')?.content, 0, 'refiner content')

      close(partyOf(b, 'customer')?.shipping_net, -7, 'customer shipping_net')
      close(partyOf(b, 'customer')?.total_profit, 188, 'customer total_profit')
      close(partyOf(b, 'dorado')?.shipping_net, 7, 'dorado shipping_net')
      close(partyOf(b, 'dorado')?.spot_net, 0, 'dorado spot_net')
      close(partyOf(b, 'dorado')?.total_profit, 7, 'dorado total_profit')
      close(partyOf(b, 'refiner')?.total_profit, 0, 'refiner total_profit')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('an order that does not exist is refused, not answered with zeros', async () => {
  await inPinnedTransaction(
    async () => {
      await assert.rejects(
        () => profitBreakdown(anUnknownId()),
        /nothing to price/,
        'a missing order was priced instead of refused'
      )
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

const setSpot = async (c: PoolClient, metal_id: string, bid: number, ask: number): Promise<void> => {
  await c.query(
    `INSERT INTO spots.spots (metal_id, bid, ask) VALUES ($1, $2, $3)
       ON CONFLICT (metal_id) DO UPDATE SET bid = EXCLUDED.bid, ask = EXCLUDED.ask`,
    [metal_id, bid, ask]
  )
}

test('a pooled order settled through the real flow prices off its own settled_spot, and is realized', async () => {
  await inPinnedTransaction(
    async (c) => {
      const { rows } = await c.query<{ id: string }>(
        'SELECT id FROM refiners.refiners ORDER BY id LIMIT 1'
      )
      const refiner_id = rows[0]!.id
      const seller = await aUser(c)
      const order = await anOrder(c, seller, { direction: 'purchase' })
        .withLines({ metal_id: 'Gold', pre_melt: 10, purity: 0.9, unit: 't oz', premium: 0.9 })
        .withSpots({ bid: 2300, ask: 2310 })
        .withTotals({})
      await c.query('UPDATE orders.orders SET spots_locked = true WHERE id = $1', [order.id])

      const engagement = await refining.create({ refiner_id, direction: 'sell' })
      const assigned = await refining.assignLots(engagement.id, [order.lots[0]!.lot_id])
      await refining.send(engagement.id)
      await setSpot(c, 'Gold', 2400, 2410)
      await refining.settle(engagement.id, { lots: [{ lot_id: assigned[0]!.lot_id }] })

      const b = await profitBreakdown(order.id)
      assert.equal(b.total_lots, 1)
      assert.equal(b.settled_lots, 1, 'a pooled lot now settles with its own spot too')
      assert.equal(b.basis, 'realized')
      close(shareOf(b, 'total', 'customer', 'Gold')?.profit, 8.1 * 2300, "customer prices off the order's own spot")
      close(shareOf(b, 'total', 'refiner', 'Gold')?.profit, 0.9 * 2400, "the refiner's share prices off the pooled lot's own settled_spot")
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})
