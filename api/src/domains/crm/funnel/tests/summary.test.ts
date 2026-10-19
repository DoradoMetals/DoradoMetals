// GET /api/leads/summary - the Leads screen's totals line and four stat tiles,
// built in SQL, answered as LeadSummary:
//
//   totals            { count, unowned, median_hours_to_first_contact }
//                     "N leads · M unowned · median Xh to first contact"
//   response_rate_by_channel   { text, call, email }
//   conversion        { rate, target, history: [{ week_start, leads, converted, rate }] }
//   first_contact     { median_hours, target_hours }
//   needs_attention   { unassigned, not_contacted }
//
// Targets come from crm.targets (lead_conversion_rate 0.25,
// lead_hours_to_first_contact 4). Archived leads (ruling 162) count nowhere.
//
// WINDOW. The test database holds committed leads, so exact numbers need the
// read to see only the rows seeded here. The summary takes an optional
// created window, `created_from` and `created_to` (ISO dates, UTC, from
// inclusive, to exclusive; both absent means all time), and the seeded rows
// sit in January 2001 where nothing else lives. An open lead is one with no
// converted_at; `unowned` and `needs_attention` count open leads only, the
// same rule the funnel's `unassigned` already uses.
//
// The seeded rows (2001-01-01 is a Monday; weeks are date_trunc('week')):
//
//   A  Mon 01-01 10:00  assigned     contacted +2h                texted, replied
//   B  Tue 01-02 10:00  assigned     contacted +6h  converted     texted, no reply
//   C  Mon 01-08 10:00  unassigned   contacted +4h                called, called back
//   D  Tue 01-09 10:00  unassigned   never contacted
//   E  Wed 01-10 10:00  unassigned   never contacted  ARCHIVED    texted, replied, converted
//
//   count 4 · unowned 2 (C, D) · median of 2, 6, 4 = 4h
//   text 1 of 2 replied = 0.5 · call 1 of 1 = 1 · email none = 0
//   conversion 1 / 4 = 0.25; week 2001-01-01: 2 leads, 1 converted, 0.5;
//                            week 2001-01-08: 2 leads, 0 converted, 0
//   needs attention: unassigned 2 (C, D), not contacted 1 (D)
import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { LeadSummary } from '@dorado/contracts'
import { mockSessions, restoreSessions, as, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR, TEST_CUSTOMER } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aTag } from '#shared/testing/builders/index.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const inLeads = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id })

const WINDOW = { created_from: '2001-01-01', created_to: '2001-01-15' }

let numbers = 0
const aPhone = (): string =>
  `512558${String((numbers += 1) * 53 + Math.floor(Math.random() * 50))
    .padStart(4, '0')
    .slice(-4)}`

type Seed = {
  created_at: string
  contacted_after_hours?: number
  converted_at?: string
  assigned?: boolean
}

async function aSeededLead(c: PoolClient, seed: Seed): Promise<{ id: string; phone: string }> {
  const phone = aPhone()
  const { rows } = await c.query<{ id: string }>(
    `INSERT INTO leads.leads (name, phone, email, created_at, contacted_at, converted_at,
                              assigned_to_id)
     VALUES ($1, $2, $3, $4::timestamptz,
             $4::timestamptz + make_interval(hours => $5::int),
             $6::timestamptz, $7)
     RETURNING id`,
    [
      `Summary Lead ${aTag()}`,
      phone,
      `${aTag()}@dorado.test`,
      seed.created_at,
      seed.contacted_after_hours ?? null,
      seed.converted_at ?? null,
      seed.assigned ? TEST_ACTOR.id : null,
    ]
  )
  return { id: rows[0]!.id, phone }
}

async function aText(c: PoolClient, phone: string, direction: 'inbound' | 'outbound') {
  await c.query(
    `INSERT INTO crm.sms_messages
            (direction, provider, provider_sid, from_number, to_number, body, status, created_at)
     VALUES ($1, 'twilio', $2, $3, $4, 'body', $5, '2001-01-03T12:00:00Z')`,
    [
      direction,
      `SMsummary${aTag()}${direction}`,
      direction === 'inbound' ? phone : '5125550000',
      direction === 'inbound' ? '5125550000' : phone,
      direction === 'inbound' ? 'received' : 'sent',
    ]
  )
}

async function aCall(c: PoolClient, phone: string, direction: 'inbound' | 'outbound') {
  await c.query(
    `INSERT INTO crm.calls (provider_sid, direction, from_number, to_number, status, started_at)
     VALUES ($1, $2::crm.call_direction, $3, $4, 'completed'::crm.call_status,
             '2001-01-09T12:00:00Z')`,
    [
      `CAsummary${aTag()}${direction}`,
      direction,
      direction === 'inbound' ? phone : '5125550000',
      direction === 'inbound' ? '5125550000' : phone,
    ]
  )
}

async function seedJanuary(c: PoolClient): Promise<void> {
  const a = await aSeededLead(c, {
    created_at: '2001-01-01T10:00:00Z',
    contacted_after_hours: 2,
    assigned: true,
  })
  const b = await aSeededLead(c, {
    created_at: '2001-01-02T10:00:00Z',
    contacted_after_hours: 6,
    converted_at: '2001-01-03T10:00:00Z',
    assigned: true,
  })
  const cc = await aSeededLead(c, { created_at: '2001-01-08T10:00:00Z', contacted_after_hours: 4 })
  await aSeededLead(c, { created_at: '2001-01-09T10:00:00Z' })
  const e = await aSeededLead(c, {
    created_at: '2001-01-10T10:00:00Z',
    converted_at: '2001-01-11T10:00:00Z',
  })
  await c.query(`UPDATE leads.leads SET archived_at = '2001-01-12T10:00:00Z' WHERE id = $1`, [e.id])

  await aText(c, a.phone, 'outbound')
  await aText(c, a.phone, 'inbound')
  await aText(c, b.phone, 'outbound')
  await aCall(c, cc.phone, 'outbound')
  await aCall(c, cc.phone, 'inbound')
  await aText(c, e.phone, 'outbound')
  await aText(c, e.phone, 'inbound')
}

async function readSummary(query: Record<string, string> = WINDOW): Promise<LeadSummary> {
  return await asAdmin(TEST_ACTOR, async () => {
    const res = await request(app).get('/api/leads/summary').query(query)
    assert.equal(res.status, 200, res.text)
    return LeadSummary.parse(res.body)
  })
}

test('the totals line: count, unowned and median hours to first contact', async () => {
  await inLeads(async (c) => {
    await seedJanuary(c)
    const s = await readSummary()
    assert.deepEqual(s.totals, { count: 4, unowned: 2, median_hours_to_first_contact: 4 })
  })
})

test('response rate by channel: text, call and email', async () => {
  await inLeads(async (c) => {
    await seedJanuary(c)
    const s = await readSummary()
    assert.deepEqual(s.response_rate_by_channel, { text: 0.5, call: 1, email: 0 })
  })
})

test('conversion rate, its target and a weekly history', async () => {
  await inLeads(async (c) => {
    await seedJanuary(c)
    const s = await readSummary()
    assert.equal(s.conversion.rate, 0.25)
    assert.equal(s.conversion.target, 0.25, 'the target is not crm.targets.lead_conversion_rate')
    assert.deepEqual(s.conversion.history, [
      { week_start: '2001-01-01', leads: 2, converted: 1, rate: 0.5 },
      { week_start: '2001-01-08', leads: 2, converted: 0, rate: 0 },
    ])
  })
})

test('median time to first contact, against the target in crm.targets', async () => {
  await inLeads(async (c) => {
    await seedJanuary(c)
    const s = await readSummary()
    assert.deepEqual(s.first_contact, { median_hours: 4, target_hours: 4 })
  })
})

test('the targets move with an UPDATE to crm.targets, not a deploy', async () => {
  await inLeads(async (c) => {
    await seedJanuary(c)
    await c.query(`UPDATE crm.targets SET value = 6 WHERE key = 'lead_hours_to_first_contact'`)
    await c.query(`UPDATE crm.targets SET value = 0.4 WHERE key = 'lead_conversion_rate'`)
    const s = await readSummary()
    assert.equal(s.first_contact.target_hours, 6)
    assert.equal(s.conversion.target, 0.4)
  })
})

test('needs attention: open leads unassigned, and open leads not contacted', async () => {
  await inLeads(async (c) => {
    await seedJanuary(c)
    const s = await readSummary()
    assert.deepEqual(s.needs_attention, { unassigned: 2, not_contacted: 1 })
  })
})

test('an archived lead counts nowhere; restoring it brings it back', async () => {
  await inLeads(async (c) => {
    await seedJanuary(c)
    const archived = await readSummary()
    assert.equal(archived.totals.count, 4)

    await c.query(
      `UPDATE leads.leads SET archived_at = NULL
        WHERE created_at = '2001-01-10T10:00:00Z' AND name LIKE 'Summary Lead %'`
    )
    const restored = await readSummary()
    assert.equal(restored.totals.count, 5, 'the restored lead did not come back')
    assert.equal(restored.totals.unowned, 2, 'a converted lead is not unowned')
    assert.equal(restored.needs_attention.unassigned, 2)
    assert.equal(restored.conversion.rate, 0.4, '2 of 5 converted')
    assert.equal(restored.response_rate_by_channel.text, 0.6667, '2 of 3 texted replied')
    assert.deepEqual(restored.conversion.history[1], {
      week_start: '2001-01-08',
      leads: 3,
      converted: 1,
      rate: 0.3333,
    })
  })
})

test('a window with no leads answers zeros and null medians, not an error', async () => {
  await inLeads(async () => {
    const s = await readSummary({ created_from: '1990-01-01', created_to: '1990-01-08' })
    assert.deepEqual(s.totals, { count: 0, unowned: 0, median_hours_to_first_contact: null })
    assert.deepEqual(s.needs_attention, { unassigned: 0, not_contacted: 0 })
    assert.equal(s.conversion.rate, 0)
    assert.deepEqual(s.conversion.history, [])
    assert.equal(s.first_contact.median_hours, null)
  })
})

test('with no window the summary reads all time and still counts the seeded rows', async () => {
  await inLeads(async (c) => {
    const before = await readSummary({})
    await seedJanuary(c)
    const after = await readSummary({})
    assert.equal(after.totals.count, before.totals.count + 4)
    assert.equal(after.needs_attention.not_contacted, before.needs_attention.not_contacted + 1)
  })
})

test('a malformed window date is refused with 400', async () => {
  await inLeads(async () => {
    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app).get('/api/leads/summary').query({ created_from: 'soon' })
      assert.equal(res.status, 400, res.text)
    })
  })
})

test('`summary` is never read as a lead id, and a customer cannot read it', async () => {
  await inLeads(async () => {
    await as({ ...TEST_CUSTOMER, role: 'user' }, async () => {
      assert.equal((await request(app).get('/api/leads/summary')).status, 403)
    })
  })
})
