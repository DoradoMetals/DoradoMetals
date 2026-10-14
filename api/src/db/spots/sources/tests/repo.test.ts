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

test('the seeded feed is Live and the default, and a feed no metal reads is Standby', async () => {
  await inRollback(async (c: PoolClient) => {
    const live = await sources.getOne('nfusion', c)
    assert.ok(live, 'migration 240 seeded no feed')
    assert.equal(live.status, 'Live')
    assert.equal(live.is_default, true, 'migration 267 did not make nfusion the default')
    assert.ok(live.metal_ids.length > 0, 'the Live feed serves no metal')

    await query(
      `INSERT INTO spots.sources (id, enabled, sort_order) VALUES ('zz-standby', true, 900)`,
      [],
      c
    )
    const standby = await sources.getOne('zz-standby', c)
    assert.equal(standby?.status, 'Standby')
    assert.deepEqual(standby?.metal_ids, [])

    await query(`DELETE FROM spots.active_sources`, [], c)
    assert.equal(
      (await sources.getOne('nfusion', c))?.status,
      'Live',
      'a metal with no override stopped following the default'
    )

    await activeSources.set('Gold', 'zz-standby', c)
    assert.deepEqual(
      (await sources.getOne('zz-standby', c))?.metal_ids,
      [],
      'a feed that has never quoted the metal took its price away'
    )

    await query(
      `INSERT INTO spots.current (source_id, metal_id, bid, ask, at, seen_at)
       VALUES ('zz-standby', 'Gold', 1, 2, now(), now())`,
      [],
      c
    )
    assert.deepEqual((await sources.getOne('zz-standby', c))?.metal_ids, ['Gold'])
  })
})

test('making a source the default clears the old one in one statement', async () => {
  await inRollback(async (c: PoolClient) => {
    await query(
      `INSERT INTO spots.sources (id, enabled, sort_order) VALUES ('zz-next', true, 901)`,
      [],
      c
    )
    assert.equal(await sources.makeDefault('zz-next', c), true)
    const defaults = await query<{ id: string }>(
      `SELECT id FROM spots.sources WHERE is_default`,
      [],
      c
    )
    assert.deepEqual(
      defaults.rows.map((r) => r.id),
      ['zz-next']
    )
    const events = await query<{ kind: string }>(
      `SELECT kind FROM spots.source_events WHERE source_id = 'zz-next'`,
      [],
      c
    )
    assert.deepEqual(
      events.rows.map((r) => r.kind),
      ['made_default']
    )
  })
})

test('two defaults at once are refused by the database', async () => {
  await inRollback(async (c: PoolClient) => {
    await assert.rejects(async () => {
      await query(
        `INSERT INTO spots.sources (id, enabled, is_default) VALUES ('zz-second', true, true)`,
        [],
        c
      )
    }, /sources_one_default/)
  })
})

test('a feed logs its first failure and its recovery, not every poll', async () => {
  await inRollback(async (c: PoolClient) => {
    await sources.stampTick('nfusion', c)
    await query(`DELETE FROM spots.source_events WHERE source_id = 'nfusion'`, [], c)
    await sources.recordFailure('nfusion', c)
    await sources.recordFailure('nfusion', c)
    await sources.recordFailure('nfusion', c)
    assert.equal((await sources.getOne('nfusion', c))?.failed_polls, 3)
    await sources.stampTick('nfusion', c)
    await sources.stampTick('nfusion', c)

    const events = await query<{ kind: string; detail: string | null }>(
      `SELECT kind, detail FROM spots.source_events WHERE source_id = 'nfusion'
        ORDER BY created_at ASC`,
      [],
      c
    )
    assert.deepEqual(events.rows, [
      { kind: 'tick_failed', detail: null },
      { kind: 'recovered', detail: 'recovered after 3 failed polls' },
    ])
    assert.equal((await sources.getOne('nfusion', c))?.failed_polls, 0)
  })
})

test('a first ever tick and an admin switching a feed off and on are events', async () => {
  await inRollback(async (c: PoolClient) => {
    await query(
      `INSERT INTO spots.sources (id, enabled, sort_order) VALUES ('zz-fresh', true, 903)`,
      [],
      c
    )
    await sources.stampTick('zz-fresh', c)
    await sources.update('zz-fresh', { enabled: false }, c)
    await sources.update('zz-fresh', { enabled: true, sort_order: 4 }, c)
    const events = await query<{ kind: string }>(
      `SELECT kind FROM spots.source_events WHERE source_id = 'zz-fresh' ORDER BY created_at ASC`,
      [],
      c
    )
    assert.deepEqual(
      events.rows.map((r) => r.kind),
      ['tick_ok', 'disabled', 'enabled']
    )
    assert.equal((await sources.getOne('zz-fresh', c))?.sort_order, 4)
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
    await activeSources.set('Silver', 'nfusion', c)
    await activeSources.set('Gold', 'nfusion', c)
    const rows = await activeSources.list(c)
    assert.equal(rows[0]?.metal_id, 'Gold', 'the list is not in metals.metals.sort_order')
    assert.equal((await activeSources.getOne('Gold', c))?.source_id, 'nfusion')
  })
})

test('a source nobody seeded is absent rather than empty', async () => {
  await inRollback(async (c: PoolClient) => {
    assert.equal(await sources.getOne('zz-not-a-feed', c), undefined)
    assert.equal(await sources.update('zz-not-a-feed', { enabled: true }, c), false)
    assert.equal(await sources.stampTick('zz-not-a-feed', c), false)
    assert.equal(await sources.recordFailure('zz-not-a-feed', c), false)
    assert.equal(await sources.makeDefault('zz-not-a-feed', c), false)
  })
})
