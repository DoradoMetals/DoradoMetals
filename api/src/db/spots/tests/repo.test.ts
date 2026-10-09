import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import pool from '#pool'
import query from '#shared/db/query.ts'
import { inRollback } from '#shared/testing/rollback.ts'
import * as spots from '#db/spots/repo.ts'

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(),
    0,
    'these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`'
  )
})

afterAll(async () => {
  await pool.end()
})

test("upsert rewrites a real metal's quote", async () => {
  await inRollback(async (c: PoolClient) => {
    const gold = 'Gold'

    const written = await spots.upsert(gold, { bid: 2401.5, ask: 2415.25 }, c)
    assert.equal(written, true, 'upsert reported no row written for Gold')

    const rows = await spots.list(c)
    const row = rows.find((r) => r.id === gold)
    assert.equal(Number(row?.bid), 2401.5)
    assert.equal(Number(row?.ask), 2415.25)
  })
})

test('upsert writes the one row a metal was missing, honoring the one-per-metal constraint', async () => {
  await inRollback(async (c: PoolClient) => {
    const silver = 'Silver'
    await query(`DELETE FROM spots.spots WHERE metal_id = $1`, [silver], c)

    await spots.upsert(
      silver,
      { ask: 30.5, bid: 30.1, dollar_change: 0.2, percent_change: 0.65 },
      c
    )

    const rows = await spots.list(c)
    const created = rows.filter((r) => r.id === silver)
    assert.equal(created.length, 1)
    assert.equal(Number(created[0]?.ask), 30.5)
  })
})

test('upsert derives a change figure for each side off the one tick the feed sends', async () => {
  await inRollback(async (c: PoolClient) => {
    await spots.upsert('Gold', { bid: 2000, ask: 2100, dollar_change: 100, percent_change: 5 }, c)

    const row = (await spots.list(c)).find((r) => r.id === 'Gold')
    assert.equal(Number(row?.bid_dollar_change), 100)
    assert.equal(Number(row?.ask_dollar_change), 100)
    assert.equal(
      Number(row?.bid_percent_change).toFixed(4),
      ((100 / 1900) * 100).toFixed(4),
      'the bid percent is measured against the bid base'
    )
    assert.equal(
      Number(row?.ask_percent_change).toFixed(4),
      ((100 / 2000) * 100).toFixed(4),
      'the ask percent is measured against the ask base, which is a different number'
    )
  })
})

test('upsert refuses a metal the reference data does not have', async () => {
  await inRollback(async (c: PoolClient) => {
    await assert.rejects(() => spots.upsert(randomUUID(), { bid: 1, ask: 2 }, c))
  })
})
