import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import * as locations from '#db/places/locations/repo.ts'
import { rollbackIn } from '#shared/testing/rollback.ts'
import { LOCKS } from '#shared/testing/locks.ts'

const inRollback = rollbackIn({ lock: LOCKS.ADDRESSES })

afterAll(async () => {
  await pool.end()
})

test('the default return location is a row, with the fields a label needs', async () => {
  await inRollback(async (c: PoolClient) => {
    const hold = await locations.defaultReturn(c)
    assert.ok(hold, '139 marked no location default_return, so no label can be held anywhere')
    assert.ok(hold.code, 'the carrier knows this location by no code')
    assert.ok(hold.address.line_1, 'the hold location has no street')
    assert.ok(hold.address.zip, 'the hold location has no postcode')
  })
})

test('only one location can be the default return', async () => {
  await inRollback(async (c: PoolClient) => {
    const { rows } = await c.query(
      `SELECT id FROM places.locations WHERE NOT default_return ORDER BY id LIMIT 1`
    )
    assert.ok(rows[0], 'every location is already the default - this proves nothing')
    await assert.rejects(
      () => c.query(`UPDATE places.locations SET default_return = true WHERE id = $1`, [rows[0].id]),
      /locations_one_default_return/,
      'two locations claimed the return address and a read would pick one at random'
    )
  })
})

test('a default with no carrier code answers nothing rather than a payload naming nowhere', async () => {
  await inRollback(async (c: PoolClient) => {
    await c.query(`UPDATE places.locations SET carrier_location_code = NULL WHERE default_return`)
    assert.equal(await locations.defaultReturn(c), undefined)
  })
})
