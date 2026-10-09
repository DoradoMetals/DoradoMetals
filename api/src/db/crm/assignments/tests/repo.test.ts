import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { inRollback } from '#shared/testing/rollback.ts'
import { aLead, aUser, anUnknownId } from '#shared/testing/builders/index.ts'
import * as assignments from '#db/crm/assignments/repo.ts'

afterAll(async () => {
  await pool.end()
})

test('create records the assignment and the database stamps the moment', async () => {
  await inRollback(async (c: PoolClient) => {
    const customer = await aUser(c)
    const owner = await aUser(c)

    const written = await assignments.create(
      { user_id: customer.id, lead_id: null, assigned_to_id: owner.id },
      c
    )
    assert.equal(written.user_id, customer.id)
    assert.equal(written.lead_id, null)
    assert.equal(written.assigned_to_id, owner.id)
    assert.ok(written.id, 'no id came back')
    assert.ok(written.assigned_at, 'the database did not stamp assigned_at')
  })
})

test('an unassign is a row of its own, with a null assignee', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    const owner = await aUser(c)

    await assignments.create({ user_id: null, lead_id: lead.id, assigned_to_id: owner.id }, c)
    const dropped = await assignments.create(
      { user_id: null, lead_id: lead.id, assigned_to_id: null },
      c
    )
    assert.equal(dropped.assigned_to_id, null)

    const history = await assignments.forSubject(null, lead.id, c)
    assert.equal(history.length, 2, 'the history lost one of the two moves')
  })
})

test('forSubject answers only the asked-for subject, newest first', async () => {
  await inRollback(async (c: PoolClient) => {
    const mine = await aLead(c)
    const theirs = await aLead(c)
    const owner = await aUser(c)
    const other = await aUser(c)

    const older = await assignments.create(
      { user_id: null, lead_id: mine.id, assigned_to_id: owner.id },
      c
    )
    const newer = await assignments.create(
      { user_id: null, lead_id: mine.id, assigned_to_id: other.id },
      c
    )
    await assignments.create({ user_id: null, lead_id: theirs.id, assigned_to_id: owner.id }, c)

    await c.query(
      `UPDATE crm.assignments SET assigned_at = assigned_at - interval '1 hour' WHERE id = $1`,
      [older.id]
    )

    const rows = await assignments.forSubject(null, mine.id, c)
    assert.deepEqual(
      rows.map((r) => r.id),
      [newer.id, older.id]
    )
  })
})

test('a customer history and a lead history do not leak into each other', async () => {
  await inRollback(async (c: PoolClient) => {
    const customer = await aUser(c)
    const lead = await aLead(c)
    const owner = await aUser(c)

    await assignments.create({ user_id: customer.id, lead_id: null, assigned_to_id: owner.id }, c)
    await assignments.create({ user_id: null, lead_id: lead.id, assigned_to_id: owner.id }, c)

    assert.equal((await assignments.forSubject(customer.id, null, c)).length, 1)
    assert.equal((await assignments.forSubject(null, lead.id, c)).length, 1)
    assert.deepEqual(await assignments.forSubject(anUnknownId(), null, c), [])
  })
})

test('the database refuses a row with two subjects', async () => {
  await inRollback(async (c: PoolClient) => {
    const customer = await aUser(c)
    const lead = await aLead(c)

    await assert.rejects(
      c.query(`INSERT INTO crm.assignments (user_id, lead_id) VALUES ($1, $2)`, [
        customer.id,
        lead.id,
      ]),
      /assignments_one_subject/
    )
  })
})

test('the database refuses a row with no subject at all', async () => {
  await inRollback(async (c: PoolClient) => {
    await assert.rejects(
      c.query(`INSERT INTO crm.assignments (user_id, lead_id) VALUES (NULL, NULL)`),
      /assignments_one_subject/
    )
  })
})

test('deleting the lead takes its assignment history with it', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    const owner = await aUser(c)
    await assignments.create({ user_id: null, lead_id: lead.id, assigned_to_id: owner.id }, c)

    await c.query(`DELETE FROM leads.leads WHERE id = $1`, [lead.id])
    assert.deepEqual(await assignments.forSubject(null, lead.id, c), [])
  })
})
