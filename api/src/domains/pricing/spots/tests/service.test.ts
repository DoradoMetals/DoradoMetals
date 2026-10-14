import { test, vi, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import pool from '#pool'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { inPinnedTransaction, outside } from '#shared/testing/pinned-pool.ts'
import { aStaleSpot, aUser, anOrder } from '#shared/testing/builders/index.ts'
import type { SpotBoard } from '@dorado/contracts'

vi.mock('#providers/nfusion/feed.ts', () => ({ SOURCE_ID: 'nfusion', fetchQuotes: vi.fn() }))

import { SOURCE_ID, fetchQuotes } from '#providers/nfusion/feed.ts'
import * as service from '#pricing/spots/service.ts'

afterAll(async () => {
  await pool.end()
})

const aQuote = (metal_id: string, bid: number, ask: number) => [
  { metal_id, ask, bid, dollar_change: 1.5, percent_change: 0.1 },
]

test('updateSpotPrices writes a quote for a metal the feed named', async () => {
  const [metal] = await outside<{ id: string }>(`SELECT id FROM metals.metals ORDER BY id LIMIT 1`)
  assert.ok(metal, 'dev has no metal to update')

  vi.mocked(fetchQuotes).mockResolvedValueOnce(aQuote(metal.id, 1230.12, 1234.56))

  await inPinnedTransaction(
    async (c) => {
      const written = await service.updateSpotPrices()
      assert.ok(written >= 1, 'updateSpotPrices reported writing nothing for a known metal')

      const { rows } = await c.query(
        `SELECT ask, bid FROM spots.current WHERE source_id = 'nfusion' AND metal_id = $1`,
        [metal.id]
      )
      assert.equal(Number(rows[0].ask), 1234.56)
      assert.equal(Number(rows[0].bid), 1230.12)
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] }
  )
})

test('updateSpotPrices ignores a quote for a name the reference data does not have', async () => {
  vi.mocked(fetchQuotes).mockResolvedValueOnce(aQuote('Not A Real Metal', 1, 1))

  await inPinnedTransaction(
    async () => {
      const written = await service.updateSpotPrices()
      assert.equal(written, 0, 'an unmatched quote name should write nothing')
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] }
  )
})

test('updateSpotPrices keeps writing a metal that carries a standing adjustment', async () => {
  vi.mocked(fetchQuotes).mockResolvedValueOnce(aQuote('Palladium', 998.88, 999.99))

  await inPinnedTransaction(
    async (c) => {
      await c.query(
        `INSERT INTO spots.adjustments (metal_id, source_id, bid_amount, ask_amount, reason)
         VALUES ('Palladium', $1, -0.25, 0.25, 'held for maintenance')
         ON CONFLICT (metal_id, source_id) DO UPDATE SET bid_amount = EXCLUDED.bid_amount`,
        [SOURCE_ID]
      )

      const written = await service.updateSpotPrices()
      assert.equal(written, 1, 'the feed skipped a metal carrying an adjustment')

      const { rows } = await c.query(
        `SELECT bid FROM spots.current WHERE source_id = 'nfusion' AND metal_id = 'Palladium'`
      )
      assert.equal(
        Number(rows[0].bid),
        998.88,
        'the feed stopped writing an adjusted metal, which is what froze the ' +
          'pre-override tick into every customer price'
      )
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] }
  )
})

test('updateSpotPrices stamps the attempt and the tick on the source row', async () => {
  vi.mocked(fetchQuotes).mockResolvedValueOnce(aQuote('Gold', 2000, 2010))

  await inPinnedTransaction(
    async (c) => {
      await service.updateSpotPrices()

      const { rows } = await c.query(
        `SELECT last_attempt_at, last_tick_at FROM spots.sources WHERE id = $1`,
        [SOURCE_ID]
      )
      assert.ok(rows[0].last_attempt_at, 'the feed did not record that it polled')
      assert.ok(rows[0].last_tick_at, 'the feed did not record that it wrote')
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] }
  )
})

test('setAdjustment puts a metal in adjust mode, removeAdjustment clears it and refuses a repeat', async () => {
  await inPinnedTransaction(
    async (c) => {
      await c.query(`UPDATE spots.current SET seen_at = now()`)
      const row = await service.setAdjustment('Palladium', SOURCE_ID, {
        bid_amount: -0.2,
        ask_amount: 0.2,
        reason: 'feed maintenance window',
      })
      assert.equal(row.metal_id, 'Palladium')
      assert.equal(row.unit, 'percent')
      assert.equal(row.scope, 'Active')
      assert.equal(Number(row.bid_amount), -0.2)

      const palladium = await service.getMetal('Palladium')
      assert.equal(palladium.mode, 'adjust', 'an adjusted metal did not read adjust')
      assert.equal(palladium.state, 'live', 'an adjusted ticking feed stopped reading live')

      await service.removeAdjustment('Palladium', SOURCE_ID)
      assert.equal(
        (await service.getMetal('Palladium')).mode,
        null,
        'the adjustment still applies after being removed'
      )

      await assert.rejects(() => service.removeAdjustment('Palladium', SOURCE_ID), /no adjustment/)
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] }
  )
})

test('a new adjustment needs a reason; an edit of one that exists does not', async () => {
  await inPinnedTransaction(
    async () => {
      await assert.rejects(
        () => service.setAdjustment('Silver', SOURCE_ID, { bid_amount: -1 }),
        /needs a reason/
      )

      await service.setAdjustment('Silver', SOURCE_ID, {
        bid_amount: -1,
        reason: 'the first write says why',
      })
      const edited = await service.setAdjustment('Silver', SOURCE_ID, { bid_amount: -2 })
      assert.equal(Number(edited.bid_amount), -2)
      assert.equal(edited.reason, 'the first write says why')
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] }
  )
})

test('an adjustment edit and an active-source switch land in one history list', async () => {
  await inPinnedTransaction(
    async () => {
      await service.setAdjustment('Platinum', SOURCE_ID, {
        bid_amount: -0.3,
        reason: 'the log has to carry this',
      })
      await service.setAdjustment('Platinum', SOURCE_ID, { bid_amount: -0.4 })
      await service.removeAdjustment('Platinum', SOURCE_ID)

      const log = await service.listAdjustmentHistory(30, 'Platinum')
      const events = log.map((row) => row.event)
      assert.ok(events.includes('adjustment set'), 'the first write left no row')
      assert.ok(events.includes('adjustment changed'), 'the edit left no row')
      assert.ok(events.includes('adjustment cleared'), 'the delete left no row')
      assert.ok(
        log.every((row) => row.metal_id === 'Platinum'),
        'the metal filter let another metal through'
      )
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] }
  )
})

test('a source is listed with a derived status and the metals it serves', async () => {
  await inPinnedTransaction(
    async () => {
      const [source] = await service.listSources()
      assert.ok(source, 'no spot source is seeded')
      assert.equal(source.id, SOURCE_ID)
      assert.equal(source.status, 'Live', 'the one feed every metal reads is not Live')
      assert.ok(source.metal_ids.includes('Gold'), 'the Metals column lost Gold')

      const off = await service.updateSource(SOURCE_ID, { enabled: false })
      assert.equal(off.status, 'Off')

      const prices = await service.getSpotPrices()
      for (const price of prices) {
        assert.equal(price.state, 'stale', 'a metal with no enabled source did not read stale')
        assert.equal(price.bid, null, 'a metal with no enabled source still resolved a bid')
      }

      await assert.rejects(() => service.updateSource('nope', { enabled: true }), /no spot source/)
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] }
  )
})

test('a metal switched to another source leaves the first adjustment dormant', async () => {
  await inPinnedTransaction(
    async (c) => {
      await c.query(
        `INSERT INTO spots.sources (id, enabled, sort_order) VALUES ('zz-test-feed', true, 901)
         ON CONFLICT (id) DO NOTHING`
      )
      await c.query(
        `INSERT INTO spots.current (source_id, metal_id, bid, ask, at, seen_at)
         VALUES ('zz-test-feed', 'Gold', 1, 2, now(), now())`
      )
      await service.setAdjustment('Gold', SOURCE_ID, {
        bid_amount: -0.5,
        reason: 'standing on the feed Gold is about to leave',
      })

      const moved = await service.setMetalSource('Gold', { source_id: 'zz-test-feed' })
      assert.equal(moved.source_id, 'zz-test-feed')
      assert.equal(moved.follows_default, false)

      const adjustments = await service.listAdjustments()
      const dormant = adjustments.find(
        (row) => row.metal_id === 'Gold' && row.source_id === SOURCE_ID
      )
      assert.equal(dormant?.scope, 'Dormant', 'an adjustment on a left feed still reads Active')

      const switched = await service.listAdjustmentHistory(30, 'Gold')
      assert.ok(
        switched.some((row) => row.field === 'active_source' && row.new_value === 'zz-test-feed'),
        'the active-source switch left no log row'
      )

      await assert.rejects(
        () => service.setMetalSource('Gold', { source_id: 'nope' }),
        /no spot source/
      )

      const following = await service.setMetalSource('Gold', { source_id: null })
      assert.equal(
        following.follows_default,
        true,
        'clearing the override did not follow the default'
      )
      assert.equal(following.source_id, SOURCE_ID)
      await assert.rejects(
        () => service.setMetalSource('Unobtainium', { source_id: null }),
        /no spot for/
      )
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] }
  )
})

test('getSettings and updateSettings round trip the stale threshold and the tick', async () => {
  await inPinnedTransaction(
    async () => {
      const before = await service.getSettings()
      const updated = await service.updateSettings({
        stale_after_seconds: before.stale_after_seconds + 1,
        tick_seconds: before.tick_seconds + 1,
      })
      assert.equal(updated.stale_after_seconds, before.stale_after_seconds + 1)
      assert.equal(updated.tick_seconds, before.tick_seconds + 1)
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS, LOCKS.SPOTS_SETTINGS] }
  )
})

test('listLocks pages the locks and unlock releases one through the orders action', async () => {
  await inPinnedTransaction(
    async (c) => {
      const order = await anOrder(c, await aUser(c), { direction: 'purchase' })
        .withLines({ bullion_id: null, metal_id: 'Gold', content: 1, premium: 1, quantity: 1 })
        .withSpots({ bid: 2000, ask: 2010 })
      await c.query('UPDATE orders.orders SET spots_locked = true WHERE id = $1', [order.id])
      await c.query(
        `INSERT INTO orders.spot_locks (order_id, metal_id, action, bid, ask)
         SELECT os.order_id, os.metal_id, 'lock', os.bid, os.ask
           FROM orders.spots os WHERE os.order_id = $1`,
        [order.id]
      )

      const page = await service.listLocks({ q: `PO-${order.number}`, page: 1 })
      const found = page.items.find((l) => l.order_id === order.id && l.metal_id === 'Gold')
      assert.ok(found, 'a locked order with spots did not show up in listLocks')
      assert.equal(found.status, 'active')
      assert.equal(Number(found.bid), 2000)

      const released = await service.unlock(found.id)
      assert.equal(released.status, 'released')
      assert.ok(released.released_at, 'the unlock event carries no time')
      const { rows } = await c.query('SELECT spots_locked FROM orders.orders WHERE id = $1', [
        order.id,
      ])
      assert.equal(rows[0].spots_locked, false, 'the order is still locked')

      await assert.rejects(() => service.unlock(found.id), /already released/)
      await assert.rejects(
        () => service.unlock('00000000-0000-4000-8000-000000000000'),
        /no spot lock/
      )
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] }
  )
})

test('making a source the default moves it, and un-defaulting one is refused', async () => {
  await inPinnedTransaction(
    async (c) => {
      await c.query(
        `INSERT INTO spots.sources (id, enabled, sort_order) VALUES ('zz-next-default', true, 905)`
      )
      const made = await service.updateSource('zz-next-default', { is_default: true })
      assert.equal(made.is_default, true)
      const sources = await service.listSources()
      assert.deepEqual(
        sources.filter((s) => s.is_default).map((s) => s.id),
        ['zz-next-default']
      )
      await assert.rejects(
        () => service.updateSource('zz-next-default', { is_default: false }),
        /another source is made the default/
      )
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] }
  )
})

test('cancel deletes the adjustment in force and refuses when there is none', async () => {
  await inPinnedTransaction(
    async () => {
      await service.setAdjustment('Silver', SOURCE_ID, {
        mode: 'freeze',
        reason: 'hold the pair',
      })
      assert.equal((await service.getMetal('Silver')).state, 'frozen')
      await service.cancelAdjustment('Silver')
      assert.equal((await service.getMetal('Silver')).mode, null)
      await assert.rejects(() => service.cancelAdjustment('Silver'), /no adjustment in force/)
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] }
  )
})

test('a freeze with no price to hold is refused unless the pair is named', async () => {
  await inPinnedTransaction(
    async (c) => {
      await c.query(`UPDATE spots.sources SET enabled = false`)
      await assert.rejects(
        () => service.setAdjustment('Gold', SOURCE_ID, { mode: 'freeze', reason: 'nothing' }),
        /no price to hold/
      )
      const named = await service.setAdjustment('Gold', SOURCE_ID, {
        mode: 'freeze',
        frozen_bid: 2000,
        frozen_ask: 2010,
        reason: 'held by hand',
      })
      assert.equal(named.frozen_bid, 2000)
      const metal = await service.getMetal('Gold')
      assert.equal(metal.state, 'frozen')
      assert.equal(metal.bid, 2000)
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] }
  )
})

test('freeze all freezes every metal with a source and needs a reason', async () => {
  await inPinnedTransaction(
    async () => {
      await assert.rejects(() => service.freezeAll({ reason: '  ' }), /needs a reason/)
      const board = await service.freezeAll({ reason: 'pricing paused' })
      assert.ok(board.spots.every((s) => s.state === 'frozen'))
      assert.deepEqual(board.paused, [])
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] }
  )
})

test('a failed poll is counted and logged once, and the run ends on the next tick', async () => {
  await inPinnedTransaction(
    async (c) => {
      await c.query(`DELETE FROM spots.source_events WHERE source_id = $1`, [SOURCE_ID])
      vi.mocked(fetchQuotes).mockRejectedValueOnce(new Error('feed down'))
      vi.mocked(fetchQuotes).mockRejectedValueOnce(new Error('feed down'))
      assert.equal(await service.updateSpotPrices(), 0)
      assert.equal(await service.updateSpotPrices(), 0)
      const [source] = (await service.listSources()).filter((s) => s.id === SOURCE_ID)
      assert.equal(source.failed_polls, 2)

      vi.mocked(fetchQuotes).mockResolvedValueOnce(aQuote('Gold', 2000, 2010))
      await service.updateSpotPrices()
      const activity = await service.metalActivity('Gold', 7)
      const feed = activity.filter((a) => a.kind === 'source').map((a) => a.event)
      assert.deepEqual(feed, ['feed recovered', 'feed failed'])
      await assert.rejects(() => service.metalActivity('Unobtainium', 7), /no spot for/)
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] }
  )
})

test('refresh polls once and answers the board', async () => {
  vi.mocked(fetchQuotes).mockResolvedValueOnce(aQuote('Gold', 2100, 2110))
  await inPinnedTransaction(
    async () => {
      const board = await service.refresh()
      assert.ok(board.spots.some((s) => s.id === 'Gold' && s.last_bid === 2100))
      await assert.rejects(() => service.getMetal('Unobtainium'), /no spot for/)
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS] }
  )
})

test('an unchanged poll ticks nothing, a moved one ticks once and the minute candle follows', async () => {
  await inPinnedTransaction(
    async (c) => {
      const count = async () =>
        (
          await c.query(
            `SELECT count(*)::int AS n FROM spots.ticks
              WHERE source_id = $1 AND metal_id = 'Gold' AND at >= now()`,
            [SOURCE_ID]
          )
        ).rows[0].n
      vi.mocked(fetchQuotes).mockResolvedValueOnce(aQuote('Gold', 3001, 3002))
      vi.mocked(fetchQuotes).mockResolvedValueOnce(aQuote('Gold', 3001, 3002))
      vi.mocked(fetchQuotes).mockResolvedValueOnce(aQuote('Gold', 3003, 3004))
      await service.updateSpotPrices()
      assert.equal(await count(), 1)
      await service.updateSpotPrices()
      assert.equal(await count(), 1, 'a poll with the same pair appended a tick')
      await service.updateSpotPrices()
      assert.equal(await count(), 2)

      const { rows } = await c.query(
        `SELECT high, close FROM spots.candles
          WHERE source_id = $1 AND metal_id = 'Gold' AND interval = '1m'
          ORDER BY bucket_start DESC LIMIT 1`,
        [SOURCE_ID]
      )
      assert.equal(rows[0].close, 3003)
      const gold = await service.getMetal('Gold')
      assert.equal(gold.state, 'live')
      assert.equal(gold.bid, 3003)
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS, LOCKS.SPOTS_SETTINGS] }
  )
})

test('an enabled source with no client never ticks and never takes a metal', async () => {
  await inPinnedTransaction(
    async (c) => {
      await c.query(
        `INSERT INTO spots.sources (id, enabled, sort_order) VALUES ('zz-kitco', true, 0)`
      )
      await c.query(`UPDATE spots.sources SET is_default = (id = 'zz-kitco')`)
      vi.mocked(fetchQuotes).mockResolvedValueOnce(aQuote('Gold', 3100, 3101))
      await service.updateSpotPrices()

      const { rows } = await c.query(
        `SELECT last_attempt_at, last_tick_at FROM spots.sources WHERE id = 'zz-kitco'`
      )
      assert.equal(rows[0].last_attempt_at, null, 'a source with no client was polled')
      assert.equal(rows[0].last_tick_at, null)
      const gold = await service.getMetal('Gold')
      assert.equal(gold.source_id, SOURCE_ID, 'a default with no quote took the price away')
      assert.equal(gold.bid, 3100)
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS, LOCKS.SPOTS_SETTINGS] }
  )
})

test('a stale metal keeps pricing from its last good tick and says so', async () => {
  await inPinnedTransaction(
    async (c) => {
      await aStaleSpot(c, 'Silver')
      const silver = await service.getMetal('Silver')
      assert.equal(silver.state, 'stale')
      assert.ok(silver.bid !== null && silver.bid > 0, 'stale refused the price')
      assert.ok(silver.last_tick_at, 'a stale metal says nothing about its last tick')
      assert.ok((await service.board()).paused.includes('Silver'))
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS, LOCKS.SPOTS_SETTINGS] }
  )
})

test('every poll publishes the board to the stream when it changed', async () => {
  await inPinnedTransaction(
    async () => {
      const seen: SpotBoard[] = []
      const stop = service.watchBoard((text) => seen.push(JSON.parse(text)))
      vi.mocked(fetchQuotes).mockResolvedValueOnce(aQuote('Gold', 3201, 3202))
      await service.updateSpotPrices()
      vi.mocked(fetchQuotes).mockRejectedValueOnce(new Error('feed down'))
      await service.updateSpotPrices()
      stop()
      assert.equal(seen.length, 1, 'an unchanged board was published again')
      assert.equal(seen[0].spots.find((s) => s.id === 'Gold')?.bid, 3201)
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS, LOCKS.SPOTS_SETTINGS] }
  )
})

test('candles read by range for the resolved source, and refuse an unknown metal or source', async () => {
  await inPinnedTransaction(
    async () => {
      vi.mocked(fetchQuotes).mockResolvedValueOnce(aQuote('Gold', 3301, 3302))
      await service.updateSpotPrices()
      const day = await service.candlesFor('Gold', { range: '1D' })
      assert.ok(day.length >= 1)
      assert.equal(day[day.length - 1].close, 3301)
      await assert.rejects(() => service.candlesFor('Unobtainium', { range: '1D' }), /no spot for/)
      await assert.rejects(
        () => service.candlesFor('Gold', { range: '1D', source: 'zz-none' }),
        /no spot source/
      )
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS, LOCKS.SPOTS_SETTINGS] }
  )
})
