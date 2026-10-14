import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import query from '#shared/db/query.ts'
import { inRollback } from '#shared/testing/rollback.ts'
import * as adjustments from '#db/spots/adjustments/repo.ts'
import * as adjustmentHistory from '#db/spots/adjustment-history/repo.ts'
import * as activeSources from '#db/spots/active-sources/repo.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'

afterAll(async () => {
  await pool.end()
})

const aStandbyFeed = async (c: PoolClient): Promise<string> => {
  await query(
    `INSERT INTO spots.sources (id, enabled, sort_order) VALUES ('zz-test-standby', true, 902)
     ON CONFLICT (id) DO NOTHING`,
    [],
    c
  )
  await query(
    `INSERT INTO spots.current (source_id, metal_id, bid, ask, at, seen_at)
     SELECT 'zz-test-standby', m.id, 1, 2, now(), now() FROM metals.metals m
     ON CONFLICT (source_id, metal_id) DO NOTHING`,
    [],
    c
  )
  return 'zz-test-standby'
}

test('a create takes the patch and the column defaults decide the rest', async () => {
  await inRollback(async (c: PoolClient) => {
    await adjustments.create('Gold', 'nfusion', { bid_amount: -0.2, reason: 'because' }, c)

    const row = await adjustments.getOne('Gold', 'nfusion', c)
    assert.ok(row, 'the adjustment was not written')
    assert.equal(Number(row.bid_amount), -0.2)
    assert.equal(Number(row.ask_amount), 0, 'the default ask amount is not zero')
    assert.equal(row.unit, 'percent', 'the default unit is not percent')
    assert.equal(row.mode, 'adjust', 'the default mode is not adjust')
    assert.equal(row.frozen_bid, null, 'an adjust row holds a pair')
    assert.equal(row.expires_at_market_open, false)
    assert.equal(row.scope, 'Active')
  })
})

test('an adjustment on a source the metal does not read is stored and dormant', async () => {
  await inRollback(async (c: PoolClient) => {
    const standby = await aStandbyFeed(c)
    await adjustments.create('Gold', standby, { bid_amount: -5, reason: 'dormant on purpose' }, c)

    const row = await adjustments.getOne('Gold', standby, c)
    assert.equal(row?.scope, 'Dormant')

    await activeSources.set('Gold', standby, c)
    assert.equal((await adjustments.getOne('Gold', standby, c))?.scope, 'Active')
  })
})

test('an expiry at market open resolves to an instant from the calendar rows', async () => {
  await inRollback(async (c: PoolClient) => {
    await adjustments.create(
      'Silver',
      'nfusion',
      { bid_amount: -1, reason: 'until the bell', expires_at_market_open: true },
      c
    )

    const row = await adjustments.getOne('Silver', 'nfusion', c)
    assert.ok(row?.expires_at_resolved, 'an at-market-open expiry resolved to nothing')
    assert.equal(row.expires_at, null, 'a market-open expiry froze an instant on the row')
    assert.ok(new Date(row.expires_at_resolved) > new Date(), 'the next market open is in the past')
  })
})

test('an update patches only the keys present, and the delete answers once', async () => {
  await inRollback(async (c: PoolClient) => {
    await adjustments.create('Platinum', 'nfusion', { bid_amount: -1, reason: 'first' }, c)

    assert.equal(await adjustments.update('Platinum', 'nfusion', { bid_amount: -2 }, c), true)
    const edited = await adjustments.getOne('Platinum', 'nfusion', c)
    assert.equal(Number(edited?.bid_amount), -2)
    assert.equal(edited?.reason, 'first', 'an absent key cleared a column')

    assert.equal(await adjustments.remove('Platinum', 'nfusion', c), true)
    assert.equal(await adjustments.remove('Platinum', 'nfusion', c), false)
  })
})

test('the trigger logs the set, the change and the clear, and the switch', async () => {
  await inRollback(async (c: PoolClient) => {
    await adjustments.create('Palladium', 'nfusion', { bid_amount: -1, reason: 'logged' }, c)
    await adjustments.update('Palladium', 'nfusion', { bid_amount: -2 }, c)
    await adjustments.remove('Palladium', 'nfusion', c)

    const rows = await adjustmentHistory.list(30, 'Palladium', c)
    const fields = rows.map((r) => r.field)
    assert.ok(fields.includes('bid_amount'), 'no bid_amount row was logged')
    assert.ok(
      rows.some((r) => r.event === 'adjustment cleared'),
      'the delete logged nothing, so "cleared" could never be drawn'
    )
    assert.ok(
      rows.filter((r) => r.field !== 'active_source').every((r) => r.actor_id !== null),
      'a logged change names no actor'
    )

    const standby = await aStandbyFeed(c)
    await activeSources.set('Palladium', standby, c)
    const after = await adjustmentHistory.list(30, 'Palladium', c)
    assert.ok(
      after.some((r) => r.field === 'active_source' && r.new_value === standby),
      'the active-source switch is missing from the one log'
    )
    assert.ok(
      after.some((r) => r.field === 'active_source' && r.source_id === null),
      'an active-source event named a source it should have left null'
    )
  })
})

test('the history window excludes what falls outside it', async () => {
  await inRollback(async (c: PoolClient) => {
    await adjustments.create('Gold', 'nfusion', { bid_amount: -1, reason: 'aged' }, c)
    await query(
      `UPDATE spots.adjustment_history SET changed_at = now() - interval '90 days'
        WHERE metal_id = 'Gold'`,
      [],
      c
    )

    assert.equal((await adjustmentHistory.list(30, 'Gold', c)).length, 0)
    assert.ok((await adjustmentHistory.list(365, 'Gold', c)).length > 0)
  })
})

test('a freeze is Active on any source and the database fills the held pair', async () => {
  await inRollback(async (c: PoolClient) => {
    const standby = await aStandbyFeed(c)
    await adjustments.create('Gold', standby, { mode: 'freeze', reason: 'hold it' }, c)
    const row = await adjustments.getOne('Gold', standby, c)
    const spot = await query<{ last_bid: number; last_ask: number }>(
      `SELECT last_bid, last_ask FROM spots.resolved WHERE metal_id = 'Gold'`,
      [],
      c
    )
    assert.equal(row?.scope, 'Active', 'a freeze on another source did not hold the metal')
    assert.equal(Number(row?.frozen_bid), Number(spot.rows[0].last_bid))
    assert.equal(Number(row?.frozen_ask), Number(spot.rows[0].last_ask))

    await adjustments.create(
      'Silver',
      'nfusion',
      {
        mode: 'freeze',
        frozen_bid: 30,
        frozen_ask: 31,
        reason: 'named pair',
      },
      c
    )
    const named = await adjustments.getOne('Silver', 'nfusion', c)
    assert.deepEqual([Number(named?.frozen_bid), Number(named?.frozen_ask)], [30, 31])
  })
})

test('cancel deletes the rows in force on the metal and leaves a dormant one', async () => {
  await inRollback(async (c: PoolClient) => {
    const standby = await aStandbyFeed(c)
    await adjustments.create('Platinum', 'nfusion', { bid_amount: -1, reason: 'live' }, c)
    await adjustments.create('Platinum', standby, { bid_amount: -2, reason: 'dormant' }, c)

    assert.equal(await adjustments.cancel('Platinum', c), 1)
    assert.equal(await adjustments.getOne('Platinum', 'nfusion', c), undefined)
    assert.ok(await adjustments.getOne('Platinum', standby, c), 'the dormant row went too')
    assert.equal(await adjustments.cancel('Platinum', c), 0)
  })
})

test('freeze all holds every unfrozen metal on its own source and logs it', async () => {
  await inRollback(async (c: PoolClient) => {
    await adjustments.create('Gold', 'nfusion', { bid_amount: -1, reason: 'was adjusting' }, c)
    const frozen = await adjustments.freezeAll('pricing paused', c)
    const metals = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM spots.resolved WHERE source_id IS NOT NULL`,
      [],
      c
    )
    assert.equal(frozen, metals.rows[0].n)
    const states = await query<{ state: string }>(
      `SELECT DISTINCT state FROM spots.resolved`,
      [],
      c
    )
    assert.deepEqual(
      states.rows.map((r) => r.state),
      ['frozen']
    )
    const gold = await adjustments.getOne('Gold', 'nfusion', c)
    assert.equal(gold?.mode, 'freeze')
    assert.equal(gold?.reason, 'pricing paused')
    assert.equal(await adjustments.freezeAll('again', c), 0, 'a frozen metal was frozen twice')

    const logged = await adjustmentHistory.list(1, 'Gold', c)
    assert.ok(
      logged.some((r) => r.event === 'freeze set'),
      'the freeze was not logged'
    )
  })
})

test('the list answers by status: active, expired once its instant passed, or all', async () => {
  await inRollback(async (c: PoolClient) => {
    await adjustments.create(
      'Gold',
      'nfusion',
      { bid_amount: -1, reason: 'lapsed', expires_at: '2020-01-01T00:00:00Z' },
      c
    )
    await adjustments.create('Silver', 'nfusion', { bid_amount: -1, reason: 'standing' }, c)

    const key = (row: { metal_id: string; source_id: string }) => `${row.metal_id}:${row.source_id}`
    const active = (await adjustments.list('active', c)).map(key)
    const expired = await adjustments.list('expired', c)
    const all = (await adjustments.list('all', c)).map(key)

    assert.ok(active.includes('Silver:nfusion'))
    assert.ok(!active.includes('Gold:nfusion'), 'a lapsed adjustment listed as active')
    assert.deepEqual(
      expired.filter((row) => row.metal_id === 'Gold').map((row) => row.expired),
      [true]
    )
    assert.ok(all.includes('Gold:nfusion') && all.includes('Silver:nfusion'))
  })
})

test('the history read returns the actor id and no stored name', async () => {
  await inRollback(async (c: PoolClient) => {
    await query(`DELETE FROM spots.adjustment_history WHERE metal_id = 'Platinum'`, [], c)
    await adjustments.create('Platinum', 'nfusion', { bid_amount: -1, reason: 'named by id' }, c)

    const rows = await adjustmentHistory.list(30, 'Platinum', c)
    assert.ok(rows.length > 0, 'the set left no history row')
    assert.ok(rows.every((r) => r.actor_id === TEST_ACTOR.id))
    assert.ok(
      rows.every((r) => !('actor_name' in r)),
      'a history row still carries a stored name'
    )
  })
})
