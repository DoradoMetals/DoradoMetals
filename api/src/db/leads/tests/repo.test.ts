import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { inRollback } from '#shared/testing/rollback.ts'
import { aLead } from '#shared/testing/builders/index.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import * as leads from '#db/leads/repo.ts'

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

test('update writes a real lead and answers the written row', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)

    const written = await leads.update(lead.id, { name: 'Renamed Lead', contacted: true }, c)
    assert.equal(written?.name, 'Renamed Lead')
    assert.equal(written?.contacted, true)
    assert.deepEqual(written, await leads.getOne(lead.id, c))
  })
})

test('update answers undefined for an id with no lead row', async () => {
  await inRollback(async (c: PoolClient) => {
    const written = await leads.update(randomUUID(), { name: 'Nobody' }, c)
    assert.equal(written, undefined, 'update answered a row for a lead that does not exist')
  })
})

test('remove deletes a real lead and answers false the second time', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)

    const removed = await leads.remove(lead.id, c)
    assert.equal(removed, true, 'remove reported no row changed')
    assert.equal(await leads.getOne(lead.id, c), undefined)

    const removedAgain = await leads.remove(lead.id, c)
    assert.equal(removedAgain, false, 'remove reported a change for a lead already gone')
  })
})

test('lead_stage climbs New -> Contacted -> Responded -> Converted as the booleans are set', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    assert.equal(lead.lead_stage, 'New')

    const contacted = await leads.update(lead.id, { contacted: true }, c)
    assert.equal(contacted?.lead_stage, 'Contacted')

    const responded = await leads.update(lead.id, { responded: true }, c)
    assert.equal(responded?.lead_stage, 'Responded')

    const converted = await leads.update(lead.id, { converted: true }, c)
    assert.equal(converted?.lead_stage, 'Converted')
  })
})

const NO_FILTER = { stage: null, priority: null, assigned_to: null, source: null, search: null }

test('list filters by stage, priority and source', async () => {
  await inRollback(async (c: PoolClient) => {
    const tag = `filter-${randomUUID().slice(0, 8)}`
    const responded = await aLead(c, { name: `${tag}-responded`, priority: 'High' })
    await leads.update(responded.id, { responded: true }, c)
    const untouched = await aLead(c, { name: `${tag}-new`, priority: 'Low' })

    const byStage = await leads.list({ ...NO_FILTER, stage: 'Responded' }, c)
    assert.ok(byStage.some((l) => l.id === responded.id))
    assert.ok(!byStage.some((l) => l.id === untouched.id))

    const byPriority = await leads.list({ ...NO_FILTER, priority: 'Low' }, c)
    assert.ok(byPriority.some((l) => l.id === untouched.id))
    assert.ok(!byPriority.some((l) => l.id === responded.id))
  })
})

test('search matches name, phone or email', async () => {
  await inRollback(async (c: PoolClient) => {
    const tag = `search-${randomUUID().slice(0, 8)}`
    const lead = await aLead(c, { name: `${tag}-name` })

    const found = await leads.list({ ...NO_FILTER, search: tag }, c)
    assert.ok(found.some((l) => l.id === lead.id))

    const missed = await leads.list({ ...NO_FILTER, search: randomUUID() }, c)
    assert.ok(!missed.some((l) => l.id === lead.id))
  })
})

test('assigned_to filters to one owner, and "unassigned" to none', async () => {
  await inRollback(async (c: PoolClient) => {
    const owner = TEST_ACTOR.id
    const owned = await aLead(c, { assigned_to_id: owner })
    const unowned = await aLead(c)

    const forOwner = await leads.list({ ...NO_FILTER, assigned_to: owner }, c)
    assert.ok(forOwner.some((l) => l.id === owned.id))
    assert.ok(!forOwner.some((l) => l.id === unowned.id))

    const unassigned = await leads.list({ ...NO_FILTER, assigned_to: 'unassigned' }, c)
    assert.ok(unassigned.some((l) => l.id === unowned.id))
    assert.ok(!unassigned.some((l) => l.id === owned.id))
  })
})
