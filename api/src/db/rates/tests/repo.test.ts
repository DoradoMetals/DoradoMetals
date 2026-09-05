import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { inRollback } from '#shared/testing/rollback.ts'
import * as rates from '#db/rates/repo.ts'

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

const aRateRow = async (c: PoolClient) =>
  rates.create(
    {
      metal_id: 'Gold',
      unit: 'oz',
      min_qty: 0,
      max_qty: 10,
      scrap_pct: 0.9,
      bullion_pct: 0.95,
    },
    c
  )

test('update writes a real rate band and answers true', async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await aRateRow(c)

    const changed = await rates.update(id, { scrap_pct: 0.88, max_qty: null }, c)
    assert.equal(changed, true, 'update reported no row changed')

    const after = await rates.getOne(id, c)
    assert.equal(Number(after?.scrap_pct), 0.88)
    assert.equal(after?.max_qty, null, 'max_qty was not cleared to open-ended')
  })
})

test('update answers false for an id with no rate row', async () => {
  await inRollback(async (c: PoolClient) => {
    const changed = await rates.update(randomUUID(), { scrap_pct: 0.5 }, c)
    assert.equal(changed, false, 'update reported a change for a rate that does not exist')
  })
})

test('remove deletes a real rate band and answers false the second time', async () => {
  await inRollback(async (c: PoolClient) => {
    const id = await aRateRow(c)

    const removed = await rates.remove(id, c)
    assert.equal(removed, true, 'remove reported no row changed')
    assert.equal(await rates.getOne(id, c), undefined)

    const removedAgain = await rates.remove(id, c)
    assert.equal(removedAgain, false, 'remove reported a change for a rate already gone')
  })
})
