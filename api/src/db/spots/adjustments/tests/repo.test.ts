import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import query from '#shared/db/query.ts'
import { inRollback } from '#shared/testing/rollback.ts'
import * as adjustments from '#db/spots/adjustments/repo.ts'
import * as adjustmentHistory from '#db/spots/adjustment-history/repo.ts'
import * as activeSources from '#db/spots/active-sources/repo.ts'

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
    assert.equal(row.enabled, true)
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
      rows.every((r) => r.actor_name !== null),
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
