import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { inRollback } from '#shared/testing/rollback.ts'
import * as overrides from '#db/spots/overrides/repo.ts'

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

test('set writes an override for a real metal and answers the row back', async () => {
  await inRollback(async (c: PoolClient) => {
    const row = await overrides.set(
      'Gold',
      { bid: 2000, ask: 2010, reason: 'feed is flapping', expires_at: null },
      c
    )
    assert.equal(row.metal_id, 'Gold')
    assert.equal(Number(row.bid), 2000)
    assert.equal(Number(row.ask), 2010)
    assert.equal(row.reason, 'feed is flapping')

    const [listed] = await overrides.list(c)
    assert.equal(listed?.metal_id, 'Gold')
  })
})

test('set upserts - a second call for the same metal replaces the row rather than duplicating it', async () => {
  await inRollback(async (c: PoolClient) => {
    await overrides.set('Silver', { bid: 30, ask: 31, reason: 'first', expires_at: null }, c)
    const replaced = await overrides.set(
      'Silver',
      { bid: 32, ask: 33, reason: 'second', expires_at: null },
      c
    )
    assert.equal(Number(replaced.bid), 32)
    assert.equal(replaced.reason, 'second')

    const rows = await overrides.list(c)
    const silver = rows.filter((r) => r.metal_id === 'Silver')
    assert.equal(silver.length, 1, 'set duplicated a row instead of replacing it')
  })
})

test('activeMetalIds excludes an override that already expired', async () => {
  await inRollback(async (c: PoolClient) => {
    await overrides.set(
      'Platinum',
      { bid: 900, ask: 910, reason: 'expired already', expires_at: '2000-01-01T00:00:00Z' },
      c
    )
    await overrides.set(
      'Palladium',
      { bid: 1000, ask: 1010, reason: 'still standing', expires_at: null },
      c
    )

    const active = await overrides.activeMetalIds(c)
    assert.ok(!active.includes('Platinum'), 'an expired override was reported active')
    assert.ok(active.includes('Palladium'), 'a standing override with no expiry went missing')
  })
})

test('remove deletes the row and answers false the second time', async () => {
  await inRollback(async (c: PoolClient) => {
    await overrides.set('Gold', { bid: 2000, ask: 2010, reason: 'test', expires_at: null }, c)

    const removed = await overrides.remove('Gold', c)
    assert.equal(removed, true, 'remove reported no row changed')

    const again = await overrides.remove('Gold', c)
    assert.equal(again, false, 'remove reported a change for an override already gone')
  })
})
