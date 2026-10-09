import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { inRollback } from '#shared/testing/rollback.ts'
import {
  aConsentEvent,
  aLead,
  aLedgerEntry,
  aNote,
  anAssignment,
  aTag,
  aUser,
} from '#shared/testing/builders/index.ts'
import * as leads from '#db/leads/repo.ts'
import * as activity from '#db/crm/activity/repo.ts'

afterAll(async () => {
  await pool.end()
})

test('the feed carries one row per fact, with the subject and the actor named', async () => {
  await inRollback(async (c: PoolClient) => {
    const customer = await aUser(c)
    const owner = await aUser(c)
    await aNote(c, { user_id: customer.id }, 'Prefers a call before we ship')
    await anAssignment(c, { user_id: customer.id }, owner.id)
    await aConsentEvent(c, { user_id: customer.id })
    await aLedgerEntry(c, customer, { type: 'Credit', amount: 250 })

    const rows = await activity.list({}, c)
    const mine = rows.filter((r) => r.subject_id === customer.id)
    assert.deepEqual(
      new Set(mine.map((r) => r.kind)),
      new Set(['note', 'assigned', 'consent', 'credit'])
    )
    for (const row of mine) {
      assert.equal(row.subject_kind, 'customer')
      assert.equal(row.subject_name, customer.name)
      assert.ok(row.label, `the ${row.kind} row carries no label from crm.timeline_kinds`)
      assert.ok(row.summary, `the ${row.kind} row carries no summary`)
      assert.ok(row.at, `the ${row.kind} row carries no moment`)
    }

    const credit = mine.find((r) => r.kind === 'credit')
    assert.match(credit!.summary, /Credit of \$250\.00/)
    const assigned = mine.find((r) => r.kind === 'assigned')
    assert.match(assigned!.summary, new RegExp(owner.name))
  })
})

test('a lead stage moment is a row, and the lead is the subject', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)
    await leads.update(lead.id, { contacted: true, responded: true }, c)
    await leads.markConverted(lead.id, c)

    const rows = (await activity.list({}, c)).filter((r) => r.subject_id === lead.id)
    assert.deepEqual(
      new Set(rows.map((r) => r.kind)),
      new Set(['created', 'contacted', 'responded', 'converted'])
    )
    for (const row of rows) {
      assert.equal(row.subject_kind, 'lead')
      assert.equal(row.subject_name, lead.name)
    }
  })
})

test('a text with no customer behind it is attributed to the lead on the number', async () => {
  await inRollback(async (c: PoolClient) => {
    const tag = aTag()
    const phone = '5125557711'
    const lead = await aLead(c, { phone })
    await c.query(
      `INSERT INTO crm.sms_messages
            (direction, provider, provider_sid, from_number, to_number, body, status)
       VALUES ('outbound', 'twilio', $1, '5125550000', $2, 'hello', 'sent')`,
      [`SMact${tag}`, phone]
    )

    const rows = (await activity.list({}, c)).filter(
      (r) => r.subject_id === lead.id && r.kind === 'text'
    )
    assert.equal(rows.length, 1, 'the text was not matched to the lead on its number')
    assert.equal(rows[0]!.subject_kind, 'lead')
  })
})

test('the feed filters to one employee, by either of the two employee identities', async () => {
  await inRollback(async (c: PoolClient) => {
    const mine = await aUser(c)
    const theirs = await aUser(c)
    const subject = await aUser(c)
    await c.query(`SELECT set_config('app.actor_id', $1, true)`, [mine.id])
    await aNote(c, { user_id: subject.id }, 'written by one employee')
    await c.query(`SELECT set_config('app.actor_id', $1, true)`, [theirs.id])
    await aNote(c, { user_id: subject.id }, 'written by another')
    const { rows: employee } = await c.query<{ id: string }>(
      `INSERT INTO auth.employees (user_id, role, enabled) VALUES ($1, 'Agent', true) RETURNING id`,
      [mine.id]
    )

    const byUserId = await activity.list({ employee_id: mine.id }, c)
    assert.ok(
      byUserId.every((r) => r.actor_id === mine.id),
      'the actor filter let another employee through'
    )
    assert.ok(
      byUserId.some((r) => r.summary === 'Note added' && r.subject_id === subject.id),
      'the actor filter dropped the row it was asked for'
    )

    const byEmployeeId = await activity.list({ employee_id: employee[0]!.id }, c)
    assert.ok(
      byEmployeeId.every((r) => r.actor_id === mine.id),
      'the auth.employees id resolved to the wrong actor'
    )
  })
})

test('the limit caps the page and the feed is newest first', async () => {
  await inRollback(async (c: PoolClient) => {
    const customer = await aUser(c)
    await aNote(c, { user_id: customer.id }, 'one')
    await aNote(c, { user_id: customer.id }, 'two')
    await aNote(c, { user_id: customer.id }, 'three')

    const capped = await activity.list({ limit: 2 }, c)
    assert.equal(capped.length, 2)

    const all = await activity.list({}, c)
    const moments = all.map((r) => new Date(r.at).getTime())
    for (let i = 1; i < moments.length; i += 1) {
      assert.ok(moments[i]! <= moments[i - 1]!, 'the feed is not newest-first')
    }
  })
})

test('a fact with no customer and no lead behind it is left out', async () => {
  await inRollback(async (c: PoolClient) => {
    const tag = aTag()
    await c.query(
      `INSERT INTO crm.sms_messages
            (direction, provider, provider_sid, from_number, to_number, body, status)
       VALUES ('inbound', 'twilio', $1, '9995550000', '5125550000', 'who is this', 'received')`,
      [`SMorphan${tag}`]
    )

    const rows = await activity.list({}, c)
    assert.ok(
      rows.every((r) => r.subject_id !== null),
      'a row the screen cannot name reached the feed'
    )
  })
})
