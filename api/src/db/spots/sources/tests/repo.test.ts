import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import query from '#shared/db/query.ts'
import { inRollback } from '#shared/testing/rollback.ts'
import * as sources from '#db/spots/sources/repo.ts'
import * as activeSources from '#db/spots/active-sources/repo.ts'

afterAll(async () => {
  await pool.end()
})

test('the seeded feed is Live, and goes Standby when no metal reads it', async () => {
  await inRollback(async (c: PoolClient) => {
    const live = await sources.getOne('nfusion', c)
    assert.ok(live, 'migration 240 seeded no feed')
    assert.equal(live.status, 'Live')
    assert.ok(live.metal_ids.length > 0, 'the Live feed serves no metal')

    await query(`DELETE FROM spots.active_sources`, [], c)
    const standby = await sources.getOne('nfusion', c)
    assert.equal(standby?.status, 'Standby')
    assert.deepEqual(standby?.metal_ids, [])
  })
})

test('a disabled feed reads Off whatever reads it', async () => {
  await inRollback(async (c: PoolClient) => {
    await sources.update('nfusion', { enabled: false }, c)
    assert.equal((await sources.getOne('nfusion', c))?.status, 'Off')
  })
})

test('the tick and the attempt are stamped separately', async () => {
  await inRollback(async (c: PoolClient) => {
    await sources.stampAttempt('nfusion', c)
    const polled = await sources.getOne('nfusion', c)
    assert.ok(polled?.last_attempt_at, 'the attempt was not stamped')
    assert.equal(polled?.last_tick_at, null, 'a poll that wrote nothing stamped a tick')

    await sources.stampTick('nfusion', c)
    assert.ok((await sources.getOne('nfusion', c))?.last_tick_at, 'the tick was not stamped')
  })
})

test('the metals a source serves are listed in the metals own sort order', async () => {
  await inRollback(async (c: PoolClient) => {
    const rows = await activeSources.list(c)
    assert.ok(rows.length > 0, 'no metal names an active source')
    assert.equal(rows[0]?.metal_id, 'Gold', 'the list is not in metals.metals.sort_order')

    await activeSources.set('Gold', 'nfusion', c)
    assert.equal((await activeSources.getOne('Gold', c))?.source_id, 'nfusion')
  })
})

test('a source nobody seeded is absent rather than empty', async () => {
  await inRollback(async (c: PoolClient) => {
    assert.equal(await sources.getOne('zz-not-a-feed', c), undefined)
    assert.equal(await sources.update('zz-not-a-feed', { enabled: true }, c), false)
    assert.equal(await sources.stampTick('zz-not-a-feed', c), false)
  })
})
