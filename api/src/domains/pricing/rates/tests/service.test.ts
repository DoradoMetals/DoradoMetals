import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import pool from '#pool'
import query from '#shared/db/query.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import * as service from '#pricing/rates/service.ts'
import { aStaleSpot } from '#shared/testing/builders/index.ts'

afterAll(async () => {
  await pool.end()
})

const pinned = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: LOCKS.RATES })

test('getRate reads a row back and refuses an id nothing names', async () => {
  await pinned(async () => {
    const [first] = await service.listAdminRates()
    assert.ok(first, 'dev has no rates')
    assert.ok('updated_by_id' in first && 'created_by_id' in first)
    assert.ok(!('updated_by' in first) && !('created_by' in first))
    assert.equal((await service.getRate(first.id)).id, first.id)
    await assert.rejects(() => service.getRate(randomUUID()), /no rate/)
  })
})

test('listPay prices every band off the resolved bid in the unit asked for', async () => {
  await pinned(async (c) => {
    await query(
      `UPDATE spots.current SET bid = 2000, seen_at = now() WHERE metal_id = 'Gold'`,
      [],
      c
    )
    await query(`DELETE FROM spots.adjustments WHERE metal_id = 'Gold'`, [], c)
    const oz = (await service.listPay('troy_oz')).filter((b) => b.metal_id === 'Gold')
    assert.ok(oz.length > 0)
    for (const band of oz) {
      assert.equal(band.spot_bid, 2000)
      assert.equal(Number(band.scrap_pay).toFixed(6), (2000 * band.scrap_pct).toFixed(6))
      assert.equal(Number(band.bullion_pay).toFixed(6), (2000 * band.bullion_pct).toFixed(6))
    }
    const dwt = (await service.listPay('dwt')).find((b) => b.id === oz[0].id)
    assert.equal(Number(dwt?.scrap_pay).toFixed(6), ((2000 * oz[0].scrap_pct) / 20).toFixed(6))
    await assert.rejects(() => service.listPay('furlong'), /furlong/)
  })
})

test('a stale metal still pays from its last good tick and says so', async () => {
  await inPinnedTransaction(
    async (c) => {
      await aStaleSpot(c, 'Gold')
      const gold = (await service.listPay('troy_oz')).filter((b) => b.metal_id === 'Gold')
      assert.ok(gold.length > 0)
      assert.ok(gold.every((b) => b.scrap_pay !== null && b.spot_state === 'stale'))
      assert.ok(gold.every((b) => b.spot_last_tick_at !== null))
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.RATES, LOCKS.SPOTS_SETTINGS] }
  )
})

test('replaceBands validates, writes and answers the metal only', async () => {
  await pinned(async () => {
    const bands = await service.replaceBands(
      'Silver',
      {
        bands: [
          { min_qty: 0, max_qty: 50, scrap_pct: 0.7, bullion_pct: 0.74 },
          { min_qty: 50, max_qty: null, scrap_pct: 0.76, bullion_pct: 0.8 },
        ],
      },
      'g'
    )
    assert.equal(bands.length, 2)
    assert.ok(bands.every((b) => b.metal_id === 'Silver' && b.display_unit === 'g'))
    await assert.rejects(
      () =>
        service.replaceBands(
          'Silver',
          { bands: [{ min_qty: 0, max_qty: 50, scrap_pct: 0.7, bullion_pct: 0.7 }] },
          'g'
        ),
      /open-ended/
    )
    await assert.rejects(
      () =>
        service.replaceBands(
          'Unobtainium',
          { bands: [{ min_qty: 0, max_qty: null, scrap_pct: 0.7, bullion_pct: 0.7 }] },
          'g'
        ),
      /no metal/
    )

    const changes = await service.listChanges({ q: 'Silver', page: 1 })
    assert.ok(changes.total > 0 && changes.items.every((r) => r.metal_id === 'Silver'))
  })
})
