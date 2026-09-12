import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { inRollback } from '#shared/testing/rollback.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import * as settings from '#db/spots/settings/repo.ts'

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

test('getOne reads the singleton row', async () => {
  await inRollback(
    async (c: PoolClient) => {
      const row = await settings.getOne(c)
      assert.equal(row.id, true)
      assert.ok(
        Number.isInteger(row.stale_after_seconds) && row.stale_after_seconds > 0,
        'stale_after_seconds should be a positive integer'
      )
    },
    { lock: LOCKS.SPOTS_SETTINGS }
  )
})

test('update changes the threshold and answers true', async () => {
  await inRollback(
    async (c: PoolClient) => {
      const changed = await settings.update({ stale_after_seconds: 120 }, c)
      assert.equal(changed, true, 'update reported no row changed')

      const row = await settings.getOne(c)
      assert.equal(row.stale_after_seconds, 120)
    },
    { lock: LOCKS.SPOTS_SETTINGS }
  )
})
