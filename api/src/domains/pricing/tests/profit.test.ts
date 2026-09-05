// What `profit_breakdown.sql` must answer, in numbers.
//
// Every expectation here is hand-computed from the fixture and written out
// long, because this file is the oracle for the rewrite: the SQL replaced 377
// lines of TypeScript and the only thing carried across was the arithmetic.
import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
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
  aRefinerEngagement,
  anUnknownId,
} from '#shared/testing/builders/index.ts'
import * as totalsRepo from '#db/orders/transactions/repo.ts'
import * as refinerItemsRepo from '#db/refiners/items/repo.ts'
import { profitBreakdown } from '#pricing/service.ts'
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

      // One scrap line the customer was paid 0.9 of spot for, and one product
      // line at 0.95 - three of them, so its declared content is 2 x 3.
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

      const [scrapLine, bullionLine] = order.items

      await totalsRepo.update(order.id, { shipping_fee_actual: 10, refiner_fee: 7 }, {}, c)
      await aPayout(c, seller, { order, payout_fee: 20 })
      await aShipment(c, order, { cost: 24.5 })

      // The refiner takes the parcel at a higher spot and a higher premium, and
      // its assay weighs the scrap HEAVIER than the customer declared.
      await aRefinerEngagement(c, order, { bid: 120, ask: 130 })
      await refinerItemsRepo.update(scrapLine!.id, { content: 10.5, premium: 0.94 }, c)
      await refinerItemsRepo.update(bullionLine!.id, { premium: 0.98 }, c)

      const b = await profitBreakdown(order.id)

      assert.equal(b.order_id, order.id)
      assert.ok(!Number.isNaN(Date.parse(b.spots_at)), 'spots_at is not a timestamp')
      assert.equal(b.shares.length, 9, 'three parties x three categories, one metal')
      assert.equal(b.parties.length, 3)
      assert.deepEqual(
        [...new Set(b.shares.map((s) => s.metal_id))],
        ['Gold'],
        'a metal with no line in the order got a row anyway'
      )

      // Scrap: customer 10 x 0.9 = 9 oz at the order's frozen bid of 100.
      // The refiner keeps 1 - 0.94 of the 10.5 oz that actually arrived, Dorado
      // the remainder, and both settle at the refiner's bid of 120.
      close(shareOf(b, 'scrap', 'customer', 'Gold')?.content, 9, 'scrap customer content')
      close(shareOf(b, 'scrap', 'customer', 'Gold')?.profit, 900, 'scrap customer profit')
      close(shareOf(b, 'scrap', 'refiner', 'Gold')?.content, 0.63, 'scrap refiner content')
      close(shareOf(b, 'scrap', 'refiner', 'Gold')?.profit, 75.6, 'scrap refiner profit')
      close(shareOf(b, 'scrap', 'dorado', 'Gold')?.content, 0.87, 'scrap dorado content')
      close(shareOf(b, 'scrap', 'dorado', 'Gold')?.profit, 104.4, 'scrap dorado profit')
      close(shareOf(b, 'scrap', 'refiner', 'Gold')?.percentage, 6, 'scrap refiner percentage')

      // Bullion: 6 oz declared, no assay weight of its own, so all three shares
      // come off the same 6.
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

      // The three shares of a metal are exactly its ounces - no rounding slack.
      for (const category of ['scrap', 'bullion', 'total']) {
        const rows = b.shares.filter((s) => s.category === category)
        close(
          rows.reduce((sum, r) => sum + r.percentage, 0),
          100,
          `${category} percentages do not sum to 100`
        )
      }

      // The customer pays the inbound parcel and the payout fee; Dorado is up
      // the difference between what it charged for carriage and what carriage
      // cost, and down the refiner's fee; the spot gap on every ounce the
      // customer was paid for (14.7 x 20) is Dorado's alone.
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
      // The rule, stated independently of the SQL under test: of the bands that
      // contain the total, the one with the lowest floor wins - so a total
      // sitting exactly on a boundary takes the LOWER band.
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
      await aRefinerEngagement(c, order, { bid: 120, ask: 130 })

      const b = await profitBreakdown(order.id)

      // No premium anywhere means the band is BOTH premiums: the customer takes
      // the band, the refiner the rest, and Dorado nothing.
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

      // An ask premium is above spot, and a share cannot be more than the whole
      // - it clamps to 1, which is what the old TypeScript did too.
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
