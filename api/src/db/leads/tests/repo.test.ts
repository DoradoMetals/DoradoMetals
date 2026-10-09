import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { inRollback } from '#shared/testing/rollback.ts'
import { aLead, contactPreferenceId, leadSourceId } from '#shared/testing/builders/index.ts'
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
    assert.ok(written?.contacted_at, 'the stage moment was not stamped')
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

test('lead_stage climbs New -> Contacted -> Responded -> Converted as the moments arrive', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    assert.equal(lead.lead_stage, 'New')
    assert.equal(lead.contacted_at, null)

    const contacted = await leads.update(lead.id, { contacted: true }, c)
    assert.equal(contacted?.lead_stage, 'Contacted')
    assert.ok(contacted?.contacted_at, 'the database did not stamp contacted_at')

    const responded = await leads.update(lead.id, { responded: true }, c)
    assert.equal(responded?.lead_stage, 'Responded')
    assert.ok(responded?.responded_at, 'the database did not stamp responded_at')

    const converted = await leads.markConverted(lead.id, c)
    assert.equal(converted?.lead_stage, 'Converted')
    assert.ok(converted?.converted_at, 'markConverted did not stamp converted_at')
  })
})

test('the stage moment and its legacy boolean are kept in step from either side', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)

    const raised = await leads.update(lead.id, { contacted: true }, c)
    assert.ok(raised?.contacted_at, 'setting the boolean did not stamp the moment')

    const cleared = await leads.update(lead.id, { contacted: false }, c)
    assert.equal(cleared?.contacted_at, null, 'clearing the boolean did not clear the moment')
    assert.equal(cleared?.lead_stage, 'New')

    await c.query(`UPDATE leads.leads SET responded_at = now() WHERE id = $1`, [lead.id])
    const stamped = await leads.getOne(lead.id, c)
    assert.equal(stamped?.responded, true, 'writing the moment did not raise the boolean')
    assert.equal(stamped?.lead_stage, 'Responded')

    await c.query(`UPDATE leads.leads SET responded_at = NULL WHERE id = $1`, [lead.id])
    const unstamped = await leads.getOne(lead.id, c)
    assert.equal(unstamped?.responded, false, 'clearing the moment did not clear the boolean')
  })
})

test('a lead is created with no stage moment on it at all', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    assert.deepEqual(
      [lead.contacted_at, lead.responded_at, lead.converted_at],
      [null, null, null],
      'a brand-new lead came out already staged'
    )
    assert.deepEqual([lead.contacted, lead.responded, lead.converted], [false, false, false])
  })
})

test('the free-text notes column is no longer written on create - a note is a row', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    assert.equal(lead.notes, null)
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

test('every created lead carries its own LEAD- number', async () => {
  await inRollback(async (c: PoolClient) => {
    const first = await aLead(c)
    const second = await aLead(c)

    assert.match(first.number, /^LEAD-\d+$/, `number was ${first.number}`)
    assert.match(second.number, /^LEAD-\d+$/)
    assert.notEqual(first.number, second.number, 'two leads drew the same number')
  })
})

test('the lead number comes from the leads sequence, not the orders one', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    const { rows } = await c.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_class cl
          JOIN pg_namespace n ON n.oid = cl.relnamespace
         WHERE cl.relkind = 'S' AND n.nspname = 'leads' AND cl.relname = 'number_seq'
       ) AS exists`
    )
    assert.equal(rows[0]?.exists, true, 'leads.number_seq is missing')
    assert.ok(lead.number.startsWith('LEAD-'))
  })
})

test('a lead carries a source row and a contact preference row', async () => {
  await inRollback(async (c: PoolClient) => {
    const source_id = await leadSourceId(c, 'walk_in')
    const contact_preference_id = await contactPreferenceId(c, 'call')
    const lead = await aLead(c, { source_id, contact_preference_id })

    assert.equal(lead.source_id, source_id)
    assert.equal(lead.contact_preference_id, contact_preference_id)

    const moved = await leads.update(
      lead.id,
      { source_id: await leadSourceId(c, 'sell_form'), contact_preference_id: null },
      c
    )
    assert.equal(moved?.source_id, await leadSourceId(c, 'sell_form'))
    assert.equal(moved?.contact_preference_id, null, 'the preference did not clear')
  })
})
