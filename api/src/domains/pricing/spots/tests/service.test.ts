import { test, vi, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import pool from '#pool'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { inPinnedTransaction, outside } from '#shared/testing/pinned-pool.ts'
import { aUser, anOrder } from '#shared/testing/builders/index.ts'

vi.mock('#providers/nfusion/feed.ts', () => ({ fetchQuotes: vi.fn() }))

import { fetchQuotes } from '#providers/nfusion/feed.ts'
import * as service from '#pricing/spots/service.ts'

afterAll(async () => {
  await pool.end()
})

test('updateSpotPrices writes a quote for a metal the feed named', async () => {
  const [metal] = await outside<{ id: string }>(`SELECT id FROM metals.metals ORDER BY id LIMIT 1`)
  assert.ok(metal, 'dev has no metal to update')

  vi.mocked(fetchQuotes).mockResolvedValueOnce(
    new Map([[metal.id, { ask: 1234.56, bid: 1230.12, dollar_change: 1.5, percent_change: 0.1 }]])
  )

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
  vi.mocked(fetchQuotes).mockResolvedValueOnce(
    new Map([['Not A Real Metal', { ask: 1, bid: 1, dollar_change: 0, percent_change: 0 }]])
  )

  await inPinnedTransaction(
    async () => {
      const written = await service.updateSpotPrices()
      assert.equal(written, 0, 'an unmatched quote name should write nothing')
    },
    { actor: TEST_ACTOR.id }
  )
})

test('updateSpotPrices skips a metal that carries a standing override', async () => {
  const [metal] = await outside<{ id: string }>(`SELECT id FROM metals.metals ORDER BY id LIMIT 1`)
  assert.ok(metal, 'dev has no metal to override')

  vi.mocked(fetchQuotes).mockResolvedValueOnce(
    new Map([[metal.id, { ask: 999.99, bid: 998.88, dollar_change: 1, percent_change: 1 }]])
  )

  await inPinnedTransaction(
    async (c) => {
      await c.query(
        `INSERT INTO spots.overrides (metal_id, bid, ask, reason)
         VALUES ($1, 1, 2, 'held for maintenance')
         ON CONFLICT (metal_id) DO UPDATE SET bid = EXCLUDED.bid, ask = EXCLUDED.ask`,
        [metal.id]
      )
      const before = await c.query('SELECT ask, bid FROM spots.spots WHERE metal_id = $1', [
        metal.id,
      ])

      const written = await service.updateSpotPrices()
      assert.equal(written, 0, 'the feed wrote an override-held metal')

      const after = await c.query('SELECT ask, bid FROM spots.spots WHERE metal_id = $1', [
        metal.id,
      ])
      assert.deepEqual(
        after.rows[0],
        before.rows[0],
        'an overridden metal was overwritten by the feed tick'
      )
    },
    { actor: TEST_ACTOR.id }
  )
})

test('setOverride marks a metal manual, removeOverride clears it and refuses a repeat', async () => {
  await inPinnedTransaction(
    async () => {
      const row = await service.setOverride('Palladium', {
        bid: 900,
        ask: 910,
        reason: 'feed maintenance window',
        expires_at: null,
      })
      assert.equal(row.metal_id, 'Palladium')
      assert.equal(row.reason, 'feed maintenance window')

      const prices = await service.getSpotPrices()
      const palladium = prices.find((p) => p.id === 'Palladium')
      assert.equal(palladium?.source, 'manual', 'a metal under override did not read manual')
      assert.equal(Number(palladium?.bid), 900)

      await service.removeOverride('Palladium')
      const after = await service.getSpotPrices()
      assert.notEqual(
        after.find((p) => p.id === 'Palladium')?.source,
        'manual',
        'the override still reads manual after being removed'
      )

      await assert.rejects(() => service.removeOverride('Palladium'), /no override/)
    },
    { actor: TEST_ACTOR.id }
  )
})

test('getSettings and updateSettings round trip the stale threshold', async () => {
  await inPinnedTransaction(
    async () => {
      const before = await service.getSettings()
      const updated = await service.updateSettings({
        stale_after_seconds: before.stale_after_seconds + 1,
      })
      assert.equal(updated.stale_after_seconds, before.stale_after_seconds + 1)
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.SPOTS_SETTINGS }
  )
})

test('listLocks surfaces an order once its spots are locked', async () => {
  await inPinnedTransaction(
    async (c) => {
      const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withSpots({
        bid: 2000,
        ask: 2010,
      })
      await c.query('UPDATE orders.orders SET spots_locked = true WHERE id = $1', [order.id])

      const locks = await service.listLocks()
      const found = locks.find((l) => l.order_id === order.id && l.metal_id === 'Gold')
      assert.ok(found, 'a locked order with spots did not show up in listLocks')
      assert.equal(found.reference, `PO-${order.number}`)
      assert.equal(Number(found.bid), 2000)
    },
    { actor: TEST_ACTOR.id, lock: LOCKS.ORDERS }
  )
})
