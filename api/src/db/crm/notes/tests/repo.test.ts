import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { inRollback } from '#shared/testing/rollback.ts'
import { aLead, aUser, anUnknownId } from '#shared/testing/builders/index.ts'
import * as notes from '#db/crm/notes/repo.ts'

afterAll(async () => {
  await pool.end()
})

test('create on a customer writes the row, and getOne agrees', async () => {
  await inRollback(async (c: PoolClient) => {
    const customer = await aUser(c)
    const written = await notes.create({ user_id: customer.id, body: 'called back' }, c)

    assert.equal(written.user_id, customer.id)
    assert.equal(written.lead_id, null)
    assert.equal(written.body, 'called back')
    assert.ok(written.id, 'no id came back')
    assert.ok(written.created_at, 'the database did not stamp created_at')
    assert.deepEqual(written, await notes.getOne(written.id, c))
  })
})

test('create on a lead writes the row, and getOne agrees', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    const written = await notes.create({ lead_id: lead.id, body: 'left a voicemail' }, c)

    assert.equal(written.lead_id, lead.id)
    assert.equal(written.user_id, null)
    assert.deepEqual(written, await notes.getOne(written.id, c))
  })
})

test('forSubject answers only the asked-for subject, never the other', async () => {
  await inRollback(async (c: PoolClient) => {
    const customer = await aUser(c)
    const lead = await aLead(c)
    const onCustomer = await notes.create({ user_id: customer.id, body: 'on the customer' }, c)
    const onLead = await notes.create({ lead_id: lead.id, body: 'on the lead' }, c)

    const customerNotes = await notes.forSubject({ user_id: customer.id, lead_id: null }, c)
    assert.deepEqual(
      customerNotes.map((n) => n.id),
      [onCustomer.id]
    )

    const leadNotes = await notes.forSubject({ user_id: null, lead_id: lead.id }, c)
    assert.deepEqual(
      leadNotes.map((n) => n.id),
      [onLead.id]
    )
  })
})

test('forSubject answers newest first', async () => {
  await inRollback(async (c: PoolClient) => {
    const customer = await aUser(c)
    const older = await notes.create({ user_id: customer.id, body: 'first call' }, c)
    const newer = await notes.create({ user_id: customer.id, body: 'second call' }, c)

    await c.query(
      `UPDATE crm.notes SET created_at = created_at - interval '1 hour' WHERE id = $1`,
      [older.id]
    )

    const rows = await notes.forSubject({ user_id: customer.id, lead_id: null }, c)
    assert.deepEqual(
      rows.map((r) => r.id),
      [newer.id, older.id]
    )
  })
})

test('update writes the body and answers the written row', async () => {
  await inRollback(async (c: PoolClient) => {
    const customer = await aUser(c)
    const note = await notes.create({ user_id: customer.id, body: 'draft' }, c)

    const written = await notes.update(note.id, { body: 'final' }, c)
    assert.equal(written?.body, 'final')
    assert.deepEqual(written, await notes.getOne(note.id, c))
  })
})

test('an empty patch answers the row unchanged rather than rewriting it', async () => {
  await inRollback(async (c: PoolClient) => {
    const customer = await aUser(c)
    const note = await notes.create({ user_id: customer.id, body: 'unchanged' }, c)

    const written = await notes.update(note.id, {}, c)
    assert.deepEqual(written, note)
  })
})

test('remove deletes the row and answers false the second time', async () => {
  await inRollback(async (c: PoolClient) => {
    const customer = await aUser(c)
    const note = await notes.create({ user_id: customer.id, body: 'gone soon' }, c)

    assert.equal(await notes.remove(note.id, c), true)
    assert.equal(await notes.getOne(note.id, c), undefined)
    assert.equal(await notes.remove(note.id, c), false)
  })
})

test('repointLeadToUser moves every note of that lead onto the customer, and leaves other leads alone', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    const otherLead = await aLead(c)
    const customer = await aUser(c)
    const first = await notes.create({ lead_id: lead.id, body: 'first contact' }, c)
    const second = await notes.create({ lead_id: lead.id, body: 'second contact' }, c)
    const untouched = await notes.create({ lead_id: otherLead.id, body: 'unrelated lead' }, c)

    const moved = await notes.repointLeadToUser(lead.id, customer.id, c)
    assert.equal(moved, 2)

    const onCustomer = await notes.forSubject({ user_id: customer.id, lead_id: null }, c)
    assert.deepEqual(new Set(onCustomer.map((n) => n.id)), new Set([first.id, second.id]))
    for (const row of onCustomer) {
      assert.equal(row.lead_id, null)
      assert.equal(row.user_id, customer.id)
    }

    const stillOnOtherLead = await notes.forSubject({ user_id: null, lead_id: otherLead.id }, c)
    assert.deepEqual(
      stillOnOtherLead.map((n) => n.id),
      [untouched.id]
    )
  })
})

test('the database refuses a row with two subjects', async () => {
  await inRollback(async (c: PoolClient) => {
    const customer = await aUser(c)
    const lead = await aLead(c)

    await assert.rejects(
      c.query('INSERT INTO crm.notes (user_id, lead_id, body) VALUES ($1, $2, $3)', [
        customer.id,
        lead.id,
        'both',
      ]),
      /notes_one_subject/
    )
  })
})

test('the database refuses a row with no subject', async () => {
  await inRollback(async (c: PoolClient) => {
    await assert.rejects(
      c.query('INSERT INTO crm.notes (user_id, lead_id, body) VALUES ($1, $2, $3)', [
        null,
        null,
        'neither',
      ]),
      /notes_one_subject/
    )
  })
})

test('the database refuses a blank body', async () => {
  await inRollback(async (c: PoolClient) => {
    const customer = await aUser(c)
    await assert.rejects(
      notes.create({ user_id: customer.id, body: '   ' }, c),
      /notes_body_is_written/
    )
  })
})

test('update answers undefined for an id that names no note', async () => {
  await inRollback(async (c: PoolClient) => {
    assert.equal(await notes.update(anUnknownId(), { body: 'x' }, c), undefined)
  })
})

test('deleting the lead takes its notes with it', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    await notes.create({ lead_id: lead.id, body: 'will be cascaded away' }, c)

    await c.query('DELETE FROM leads.leads WHERE id = $1', [lead.id])
    assert.deepEqual(await notes.forSubject({ user_id: null, lead_id: lead.id }, c), [])
  })
})
