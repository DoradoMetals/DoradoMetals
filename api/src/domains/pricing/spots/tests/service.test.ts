import { test, vi, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import pool from '#pool'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { inPinnedTransaction, outside } from '#shared/testing/pinned-pool.ts'
import { aUser, anOrder } from '#shared/testing/builders/index.ts'

vi.mock('#providers/nfusion/feed.ts', () => ({ SOURCE_ID: 'nfusion', fetchQuotes: vi.fn() }))

import { SOURCE_ID, fetchQuotes } from '#providers/nfusion/feed.ts'
import * as service from '#pricing/spots/service.ts'

afterAll(async () => {
  await pool.end()
})

const aQuote = (metal_id: string, bid: number, ask: number) =>
  new Map([[metal_id, { ask, bid, dollar_change: 1.5, percent_change: 0.1 }]])

test('updateSpotPrices writes a quote for a metal the feed named', async () => {
  const [metal] = await outside<{ id: string }>(`SELECT id FROM metals.metals ORDER BY id LIMIT 1`)
  assert.ok(metal, 'dev has no metal to update')

  vi.mocked(fetchQuotes).mockResolvedValueOnce(aQuote(metal.id, 1230.12, 1234.56))

  await inPinnedTransaction(
    async (c) => {
      const written = await service.updateSpotPrices()
      assert.ok(written >= 1, 'updateSpotPrices reported writing nothing for a known metal')

      const { rows } = await c.query(`SELECT ask, bid FROM spots.spots WHERE metal_id = $1`, [
        metal.id,
      ])
      assert.equal(Number(rows[0].ask), 1234.56)
      assert.equal(Number(rows[0].bid), 1230.12)
    },
    { actor: TEST_ACTOR.id }
  )
})

test('updateSpotPrices ignores a quote for a name the reference data does not have', async () => {
  vi.mocked(fetchQuotes).mockResolvedValueOnce(aQuote('Not A Real Metal', 1, 1))

  await inPinnedTransaction(
    async () => {
      const written = await service.updateSpotPrices()
      assert.equal(written, 0, 'an unmatched quote name should write nothing')
    },
    { actor: TEST_ACTOR.id }
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

      const { rows } = await c.query(`SELECT bid FROM spots.spots WHERE metal_id = 'Palladium'`)
      assert.equal(
        Number(rows[0].bid),
        998.88,
        'the feed stopped writing an adjusted metal, which is what froze the ' +
          'pre-override tick into every customer price'
      )
    },
    { actor: TEST_ACTOR.id }
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
    { actor: TEST_ACTOR.id }
  )
})

test('setAdjustment marks a metal manual, removeAdjustment clears it and refuses a repeat', async () => {
  await inPinnedTransaction(
    async () => {
      const row = await service.setAdjustment('Palladium', SOURCE_ID, {
        bid_amount: -0.2,
        ask_amount: 0.2,
        reason: 'feed maintenance window',
      })
      assert.equal(row.metal_id, 'Palladium')
      assert.equal(row.unit, 'percent')
      assert.equal(row.scope, 'Active')
      assert.equal(Number(row.bid_amount), -0.2)

      const prices = await service.getSpotPrices()
      const palladium = prices.find((p) => p.id === 'Palladium')
      assert.equal(palladium?.state, 'manual', 'an adjusted metal did not read manual')

      await service.removeAdjustment('Palladium', SOURCE_ID)
      const after = await service.getSpotPrices()
      assert.notEqual(
        after.find((p) => p.id === 'Palladium')?.state,
        'manual',
        'the adjustment still reads manual after being removed'
      )

      await assert.rejects(() => service.removeAdjustment('Palladium', SOURCE_ID), /no adjustment/)
    },
    { actor: TEST_ACTOR.id }
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
    { actor: TEST_ACTOR.id }
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
    { actor: TEST_ACTOR.id }
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
    { actor: TEST_ACTOR.id }
  )
})

test('a metal switched to another source leaves the first adjustment dormant', async () => {
  await inPinnedTransaction(
    async (c) => {
      await c.query(
        `INSERT INTO spots.sources (id, enabled, sort_order) VALUES ('zz-test-feed', true, 901)
         ON CONFLICT (id) DO NOTHING`
      )
      await service.setAdjustment('Gold', SOURCE_ID, {
        bid_amount: -0.5,
        reason: 'standing on the feed Gold is about to leave',
      })

      const moved = await service.setActiveSource('Gold', { source_id: 'zz-test-feed' })
      assert.equal(moved.source_id, 'zz-test-feed')

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
        () => service.setActiveSource('Gold', { source_id: 'nope' }),
        /no spot source/
      )
    },
    { actor: TEST_ACTOR.id }
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
    { actor: TEST_ACTOR.id, lock: LOCKS.SPOTS_SETTINGS }
  )
})

test('listLocks surfaces a lock event once an order is locked', async () => {
  await inPinnedTransaction(
    async (c) => {
      const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withSpots({
        bid: 2000,
        ask: 2010,
      })
      await c.query('UPDATE orders.orders SET spots_locked = true WHERE id = $1', [order.id])
      await c.query(
        `INSERT INTO orders.spot_locks (order_id, metal_id, action, bid, ask)
         SELECT os.order_id, os.metal_id, 'lock', os.bid, os.ask
           FROM orders.spots os WHERE os.order_id = $1`,
        [order.id]
      )

      const locks = await service.listLocks()
      const found = locks.find((l) => l.order_id === order.id && l.metal_id === 'Gold')
      assert.ok(found, 'a locked order with spots did not show up in listLocks')
      assert.equal(found.reference, `PO-${order.number}`)
      assert.equal(Number(found.bid), 2000)
      assert.equal(found.state, 'Locked')
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})
