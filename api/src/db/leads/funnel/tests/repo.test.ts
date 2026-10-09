import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { TEST_ACTOR, actingAs } from '#shared/testing/actor.ts'
import { aLead, aTag } from '#shared/testing/builders/index.ts'
import * as funnel from '#db/leads/funnel/repo.ts'
import * as leads from '#db/leads/repo.ts'

afterAll(async () => {
  await pool.end()
})

// The funnel counts EVERY lead, so a before/after delta has to be read from
// one snapshot: another test file committing a lead between the two reads
// would otherwise move the number under it. REPEATABLE READ pins the
// snapshot; the transaction's own writes are still visible to itself.
async function inSnapshot<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect()
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
  try {
    await actingAs(c, TEST_ACTOR.id)
    return await fn(c)
  } finally {
    await c.query('ROLLBACK')
    c.release()
  }
}

let phones = 0
const aPhone = (): string => `512555${String(2000 + (phones += 1)).padStart(4, '0')}`

async function aText(
  c: PoolClient,
  phone: string,
  direction: 'inbound' | 'outbound',
  minutesAgo: number
): Promise<void> {
  const tag = aTag()
  await c.query(
    `INSERT INTO crm.sms_messages
            (direction, provider, provider_sid, from_number, to_number, body, status, created_at)
     VALUES ($1, 'twilio', $2, $3, $4, 'body', $5, now() - ($6 || ' minutes')::interval)`,
    [
      direction,
      `SMfunnel${tag}`,
      direction === 'inbound' ? phone : '5125550000',
      direction === 'inbound' ? '5125550000' : phone,
      direction === 'inbound' ? 'received' : 'sent',
      String(minutesAgo),
    ]
  )
}

test('the funnel answers its whole shape, targets included', async () => {
  await inSnapshot(async (c: PoolClient) => {
    const read = await funnel.get(c)

    assert.equal(typeof read.open, 'number')
    assert.equal(typeof read.unassigned, 'number')
    assert.equal(typeof read.never_contacted, 'number')
    assert.equal(typeof read.both, 'number')
    assert.ok(read.conversion_rate >= 0 && read.conversion_rate <= 1)
    assert.ok(read.response_rate_by_channel.text >= 0)
    assert.ok(read.response_rate_by_channel.call >= 0)
    assert.ok(read.response_rate_by_channel.email >= 0)
    assert.equal(read.conversion_rate_target, 0.25, 'the seeded conversion target moved')
    assert.equal(read.hours_to_first_contact_target, 4, 'the seeded time target moved')
  })
})

test('an untouched, unowned lead moves open, unassigned, never_contacted and both', async () => {
  await inSnapshot(async (c: PoolClient) => {
    const before = await funnel.get(c)
    await aLead(c, { phone: aPhone() })
    const after = await funnel.get(c)

    assert.equal(after.open, before.open + 1)
    assert.equal(after.unassigned, before.unassigned + 1)
    assert.equal(after.never_contacted, before.never_contacted + 1)
    assert.equal(after.both, before.both + 1)
  })
})

test('a converted lead is no longer open, and raises the conversion rate', async () => {
  await inSnapshot(async (c: PoolClient) => {
    const lead = await aLead(c, { phone: aPhone() })
    const open = await funnel.get(c)

    await leads.update(lead.id, { converted: true }, c)
    const closed = await funnel.get(c)

    assert.equal(closed.open, open.open - 1)
    assert.equal(closed.both, open.both - 1)
    assert.ok(
      closed.conversion_rate > open.conversion_rate,
      'converting a lead did not move the conversion rate'
    )
  })
})

test('a contacted lead stops counting as never_contacted', async () => {
  await inSnapshot(async (c: PoolClient) => {
    const lead = await aLead(c, { phone: aPhone() })
    const before = await funnel.get(c)

    await leads.update(lead.id, { contacted: true }, c)
    const after = await funnel.get(c)

    assert.equal(after.never_contacted, before.never_contacted - 1)
    assert.equal(after.both, before.both - 1)
    assert.equal(after.open, before.open, 'contacting a lead closed it')
  })
})

test('a lead that was texted and replied makes the text response rate positive', async () => {
  await inSnapshot(async (c: PoolClient) => {
    const phone = aPhone()
    await aLead(c, { phone })
    await aText(c, phone, 'outbound', 30)
    await aText(c, phone, 'inbound', 20)

    const read = await funnel.get(c)
    assert.ok(read.response_rate_by_channel.text > 0, 'a real reply did not register')
    assert.ok(read.response_rate_by_channel.text <= 1)
  })
})

test('an outbound text after the lead was created gives a median time to first contact', async () => {
  await inSnapshot(async (c: PoolClient) => {
    const phone = aPhone()
    await aLead(c, { phone })
    await aText(c, phone, 'outbound', 0)

    const read = await funnel.get(c)
    assert.notEqual(
      read.median_hours_to_first_contact,
      null,
      'a first contact that exists produced no median'
    )
  })
})
