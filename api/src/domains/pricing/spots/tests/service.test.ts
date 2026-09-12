import { test, vi, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import pool from '#pool'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction, outside } from '#shared/testing/pinned-pool.ts'

vi.mock('#providers/market/nfusion/feed.ts', () => ({ fetchQuotes: vi.fn() }))

import { fetchQuotes } from '#providers/market/nfusion/feed.ts'
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
