import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import query from '#shared/db/query.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aStaleSpot, aUser, anOrder } from '#shared/testing/builders/index.ts'
import * as pricing from '#pricing/index.ts'

afterAll(async () => {
  await pool.end()
})

const METAL = 'Gold'
const FEED_BID = 2000
const FEED_ASK = 2010

async function aPricedOrder(c: PoolClient): Promise<string> {
  await query(
    `UPDATE spots.current SET bid = $1, ask = $2, dollar_change = 0, percent_change = 0,
            seen_at = now()
      WHERE metal_id = $3`,
    [FEED_BID, FEED_ASK, METAL],
    c
  )
  const order = await anOrder(c, await aUser(c), { direction: 'purchase' })
    .withLines({ bullion_id: null, metal_id: METAL, content: 1, premium: 1, quantity: 1 })
    .withSpots({ bid: null, ask: null })
  return order.id
}

const adjust = async (c: PoolClient, source_id: string, bid: number, ask: number, unit: string) =>
  await query(
    `INSERT INTO spots.adjustments (metal_id, source_id, bid_amount, ask_amount, unit, reason)
     VALUES ($1, $2, $3, $4, $5, 'the proof that an adjustment reaches money')
     ON CONFLICT (metal_id, source_id) DO UPDATE
        SET bid_amount = EXCLUDED.bid_amount,
            ask_amount = EXCLUDED.ask_amount,
            unit = EXCLUDED.unit`,
    [METAL, source_id, bid, ask, unit],
    c
  )

test('an adjustment on the active source changes what an order pays', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const order_id = await aPricedOrder(c)
      const active = await query<{ source_id: string }>(
        `SELECT source_id FROM spots.resolved WHERE metal_id = $1`,
        [METAL],
        c
      )
      const source_id = active.rows[0]?.source_id
      assert.ok(source_id, `${METAL} has no active spot source`)

      const before = await pricing.priceOrder(order_id, c)
      assert.equal(Number(before.items_total).toFixed(6), FEED_BID.toFixed(6))

      await adjust(c, source_id, -0.2, 0.2, 'percent')

      const after = await pricing.priceOrder(order_id, c)
      assert.equal(
        Number(after.items_total).toFixed(6),
        (FEED_BID * 0.998).toFixed(6),
        'an adjustment on the active source moved the admin screen and not the money - ' +
          'this is the bug the audit found in section 2a'
      )
      assert.notEqual(
        Number(after.items_total),
        Number(before.items_total),
        'the priced amount did not move at all'
      )
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('a dollar adjustment shifts the priced spot by exactly that many dollars', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const order_id = await aPricedOrder(c)
      const active = await query<{ source_id: string }>(
        `SELECT source_id FROM spots.resolved WHERE metal_id = $1`,
        [METAL],
        c
      )
      await adjust(c, active.rows[0].source_id, -11.2, -2.8, 'dollars')

      const quote = await pricing.priceOrder(order_id, c)
      assert.equal(Number(quote.items_total).toFixed(6), (FEED_BID - 11.2).toFixed(6))
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('an adjustment on a source the metal is not reading prices nothing', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const order_id = await aPricedOrder(c)
      await query(
        `INSERT INTO spots.sources (id, enabled, sort_order) VALUES ('zz-test-standby', true, 900)
         ON CONFLICT (id) DO NOTHING`,
        [],
        c
      )
      await adjust(c, 'zz-test-standby', -50, -50, 'percent')

      const quote = await pricing.priceOrder(order_id, c)
      assert.equal(
        Number(quote.items_total).toFixed(6),
        FEED_BID.toFixed(6),
        'a dormant adjustment reached the price'
      )
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('a deleted adjustment stops pricing, and an expired one has lapsed', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const order_id = await aPricedOrder(c)
      const active = await query<{ source_id: string }>(
        `SELECT source_id FROM spots.resolved WHERE metal_id = $1`,
        [METAL],
        c
      )
      const source_id = active.rows[0].source_id
      await adjust(c, source_id, -10, -10, 'percent')
      await query(
        `DELETE FROM spots.adjustments WHERE metal_id = $1 AND source_id = $2`,
        [METAL, source_id],
        c
      )
      assert.equal(
        Number((await pricing.priceOrder(order_id, c)).items_total).toFixed(6),
        FEED_BID.toFixed(6),
        'a cancelled adjustment still priced'
      )

      await adjust(c, source_id, -10, -10, 'percent')
      await query(
        `UPDATE spots.adjustments SET expires_at = now() - interval '1 minute'
          WHERE metal_id = $1 AND source_id = $2`,
        [METAL, source_id],
        c
      )
      assert.equal(
        Number((await pricing.priceOrder(order_id, c)).items_total).toFixed(6),
        FEED_BID.toFixed(6),
        'an expired adjustment still priced'
      )
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('a freeze holds the last resolved pair and ignores the next tick', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const order_id = await aPricedOrder(c)
      const active = await query<{ source_id: string }>(
        `SELECT source_id FROM spots.resolved WHERE metal_id = $1`,
        [METAL],
        c
      )
      const source_id = active.rows[0].source_id
      await adjust(c, source_id, -10, -10, 'percent')
      await query(
        `UPDATE spots.adjustments SET mode = 'freeze' WHERE metal_id = $1 AND source_id = $2`,
        [METAL, source_id],
        c
      )
      const held = await query<{ frozen_bid: number; frozen_ask: number }>(
        `SELECT frozen_bid, frozen_ask FROM spots.adjustments WHERE metal_id = $1 AND source_id = $2`,
        [METAL, source_id],
        c
      )
      assert.equal(Number(held.rows[0].frozen_bid).toFixed(6), (FEED_BID * 0.9).toFixed(6))
      assert.equal(Number(held.rows[0].frozen_ask).toFixed(6), (FEED_ASK * 0.9).toFixed(6))

      await query(`UPDATE spots.current SET bid = 1, ask = 2 WHERE metal_id = $1`, [METAL], c)
      assert.equal(
        Number((await pricing.priceOrder(order_id, c)).items_total).toFixed(6),
        (FEED_BID * 0.9).toFixed(6),
        'a frozen metal followed the feed'
      )

      await query(
        `UPDATE spots.adjustments SET mode = 'adjust' WHERE metal_id = $1 AND source_id = $2`,
        [METAL, source_id],
        c
      )
      const cleared = await query<{ frozen_bid: number | null }>(
        `SELECT frozen_bid FROM spots.adjustments WHERE metal_id = $1 AND source_id = $2`,
        [METAL, source_id],
        c
      )
      assert.equal(cleared.rows[0].frozen_bid, null, 'leaving freeze kept the held pair')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('a stale quote still prices from the last good tick and warns, and a frozen one prices through it', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const order_id = await aPricedOrder(c)
      await aStaleSpot(c, METAL)
      const state = await query<{ state: string; bid: number | null; last_bid: number }>(
        `SELECT state, bid, last_bid FROM spots.resolved WHERE metal_id = $1`,
        [METAL],
        c
      )
      assert.equal(state.rows[0].state, 'stale')
      assert.equal(Number(state.rows[0].bid), FEED_BID, 'a stale metal lost its price')
      assert.equal(Number(state.rows[0].last_bid), FEED_BID, 'the last good bid is gone')
      const stale = await pricing.priceOrder(order_id, c)
      assert.equal(Number(stale.items_total).toFixed(6), FEED_BID.toFixed(6))
      assert.deepEqual(stale.unpriceable, [])
      const warned = stale.spots.find((s) => s.metal_id === METAL)
      assert.equal(warned?.state, 'stale')
      assert.ok(warned?.last_tick_at, 'a stale spot did not say when it was last seen')

      const source = await query<{ source_id: string }>(
        `SELECT source_id FROM spots.resolved WHERE metal_id = $1`,
        [METAL],
        c
      )
      await query(
        `INSERT INTO spots.adjustments (metal_id, source_id, mode, reason)
         VALUES ($1, $2, 'freeze', 'the feed is down')
         ON CONFLICT (metal_id, source_id) DO UPDATE SET mode = 'freeze'`,
        [METAL, source.rows[0].source_id],
        c
      )
      assert.equal(
        Number((await pricing.priceOrder(order_id, c)).items_total).toFixed(6),
        FEED_BID.toFixed(6),
        'a freeze did not hold the last good pair through a stale feed'
      )
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.SPOTS_SETTINGS] }
  )
})

test('a metal follows the default source, and falls back in sort order when it is off', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      await query(
        `INSERT INTO spots.sources (id, enabled, sort_order) VALUES ('backup', true, 50)`,
        [],
        c
      )
      await query(
        `INSERT INTO spots.current (source_id, metal_id, bid, ask, dollar_change, percent_change, at, seen_at)
         VALUES ('backup', $1, 1, 2, 0, 0, now(), now())`,
        [METAL],
        c
      )
      await query(`DELETE FROM spots.active_sources WHERE metal_id = $1`, [METAL], c)
      const resolved = async () =>
        (
          await query<{ source_id: string | null; follows_default: boolean }>(
            `SELECT source_id, follows_default FROM spots.resolved WHERE metal_id = $1`,
            [METAL],
            c
          )
        ).rows[0]

      const def = await query<{ id: string }>(
        `SELECT id FROM spots.sources WHERE is_default`,
        [],
        c
      )
      assert.deepEqual(await resolved(), { source_id: def.rows[0].id, follows_default: true })

      await query(`UPDATE spots.sources SET enabled = false WHERE id <> 'backup'`, [], c)
      assert.deepEqual(await resolved(), { source_id: 'backup', follows_default: true })

      await query(
        `INSERT INTO spots.active_sources (metal_id, source_id) VALUES ($1, 'backup')`,
        [METAL],
        c
      )
      assert.deepEqual(await resolved(), { source_id: 'backup', follows_default: false })
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('a dollar adjustment moves each side by its own signed amount', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      await aPricedOrder(c)
      const source = await query<{ source_id: string }>(
        `SELECT source_id FROM spots.resolved WHERE metal_id = $1`,
        [METAL],
        c
      )
      await adjust(c, source.rows[0].source_id, -12.5, 3, 'dollars')
      const row = await query<{ bid: number; ask: number; mode: string }>(
        `SELECT bid, ask, mode FROM spots.resolved WHERE metal_id = $1`,
        [METAL],
        c
      )
      assert.equal(Number(row.rows[0].bid), FEED_BID - 12.5)
      assert.equal(Number(row.rows[0].ask), FEED_ASK + 3)
      assert.equal(row.rows[0].mode, 'adjust')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('an expiry at market open stands until the calendar says the bell rang', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const order_id = await aPricedOrder(c)
      const active = await query<{ source_id: string }>(
        `SELECT source_id FROM spots.resolved WHERE metal_id = $1`,
        [METAL],
        c
      )
      const source_id = active.rows[0].source_id
      await adjust(c, source_id, -10, -10, 'percent')
      await query(
        `UPDATE spots.adjustments SET expires_at_market_open = true
          WHERE metal_id = $1 AND source_id = $2`,
        [METAL, source_id],
        c
      )

      const standing = await pricing.priceOrder(order_id, c)
      assert.equal(
        Number(standing.items_total).toFixed(6),
        (FEED_BID * 0.9).toFixed(6),
        'an adjustment written just now cannot already have survived a market open'
      )

      const calendar = await query<{ aged: Date; fresh: Date; over_christmas: Date }>(
        `SELECT spots.next_market_open(now() - interval '30 days') AS aged,
                spots.next_market_open(now()) AS fresh,
                spots.next_market_open('2026-12-24 20:00:00+00'::timestamptz) AS over_christmas`,
        [],
        c
      )
      const row = calendar.rows[0]
      assert.ok(
        new Date(row.aged) < new Date(),
        'a row last written a month ago would still be standing, so it could never lapse'
      )
      assert.ok(new Date(row.fresh) > new Date(), 'the next market open is already behind us')
      assert.equal(
        new Date(row.over_christmas).toISOString().slice(0, 10),
        '2026-12-28',
        'the calendar opened the market on Christmas Day or over the weekend'
      )
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})

test('a metal with no enabled source refuses to price rather than paying out on nothing', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const order_id = await aPricedOrder(c)
      await query(`UPDATE spots.sources SET enabled = false`, [], c)

      await assert.rejects(
        () => pricing.priceOrder(order_id, c),
        /cannot be priced/,
        'an order priced silently against a figure no feed stands behind'
      )
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})
