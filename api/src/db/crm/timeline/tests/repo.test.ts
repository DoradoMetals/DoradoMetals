import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import pool from '#pool'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import {
  aConsentEvent,
  aLead,
  aNote,
  anAssignment,
  anEstimateItem,
  aTag,
  aUser,
} from '#shared/testing/builders/index.ts'
import { inRollback } from '#shared/testing/rollback.ts'
import * as leads from '#db/leads/repo.ts'
import * as repo from '#db/crm/timeline/repo.ts'

afterAll(async () => {
  await pool.end()
})

test('the timeline merges sms, call and email rows in one read, oldest first', async () => {
  await inPinnedTransaction(
    async (client) => {
      const user = await aUser(client)

      await client.query(
        `INSERT INTO crm.sms_messages (direction, provider, provider_sid, from_number, to_number, body, status, user_id, created_at)
         VALUES ('inbound', 'twilio', 'SMtimeline00000000000000000001', '+15125550001', '+15125550000', 'hi', 'received', $1, now() - interval '3 minutes')`,
        [user.id]
      )
      await client.query(
        `INSERT INTO crm.calls (provider, provider_sid, direction, from_number, to_number, status, user_id, started_at)
         VALUES ('twilio', 'CAtimeline00000000000000000001', 'inbound', '+15125550001', '+15125550000', 'completed', $1, now() - interval '2 minutes')`,
        [user.id]
      )
      await client.query(
        `INSERT INTO media.emails (kind, status, to_address, subject, user_id, sent_at)
         VALUES ('account_created', 'sent', 'zz-timeline@dorado.test', 'Welcome', $1, now() - interval '1 minute')`,
        [user.id]
      )

      const rows = await repo.forCustomer(user.id, client)
      const kinds = rows.map((r) => r.kind)
      assert.deepEqual(new Set(kinds), new Set(['sms', 'call', 'email']))

      const timestamps = rows.map((r) => new Date(r.at).getTime())
      for (let i = 1; i < timestamps.length; i += 1) {
        assert.ok(timestamps[i] >= timestamps[i - 1], 'the timeline is not oldest-first')
      }
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})

test('the lead timeline merges every fact about a lead and labels each kind from the row', async () => {
  await inRollback(
    async (client) => {
      const tag = aTag()
      const phone = `512555${tag.slice(-4).replace(/\D/g, '1')}`
      const email = `${tag}@dorado.test`
      const owner = await aUser(client)
      const lead = await aLead(client, { phone, email })

      await client.query(
        `INSERT INTO crm.sms_messages
              (direction, provider, provider_sid, from_number, to_number, body, status, created_at)
       VALUES ('outbound', 'twilio', $1, '5125550000', $2, 'hello', 'sent',
               now() - interval '4 minutes')`,
        [`SMlead${tag}`, phone]
      )
      await client.query(
        `INSERT INTO crm.calls
              (provider, provider_sid, direction, from_number, to_number, status, started_at)
       VALUES ('twilio', $1, 'inbound', $2, '5125550000', 'completed',
               now() - interval '3 minutes')`,
        [`CAlead${tag}`, phone]
      )
      await client.query(
        `INSERT INTO media.emails (kind, status, to_address, subject, sent_at)
       VALUES ('promo', 'sent', $1, 'A note', now() - interval '2 minutes')`,
        [email]
      )
      await anEstimateItem(client, lead.id)
      await aNote(client, { lead_id: lead.id }, 'Called about a ring')
      await aConsentEvent(client, { lead_id: lead.id })
      await anAssignment(client, { lead_id: lead.id }, owner.id)
      await leads.update(lead.id, { contacted: true, responded: true }, client)
      await leads.markConverted(lead.id, client)

      const rows = await repo.forLead(lead.id, client)
      const kinds = new Set(rows.map((r) => r.kind))
      for (const expected of [
        'created',
        'assigned',
        'call',
        'text',
        'email',
        'note',
        'consent',
        'estimate_item',
        'contacted',
        'responded',
        'converted',
      ]) {
        assert.ok(kinds.has(expected), `the timeline has no ${expected} row`)
      }

      for (const row of rows) {
        assert.ok(row.label, `the ${row.kind} row carries no label from crm.timeline_kinds`)
        assert.ok(row.summary, `the ${row.kind} row carries no summary`)
      }

      const created = rows.find((r) => r.kind === 'created')
      assert.match(created!.summary, /^Lead LEAD-\d+ created$/)

      const assigned = rows.find((r) => r.kind === 'assigned')
      assert.match(assigned!.summary, new RegExp(owner.name))

      const timestamps = rows.map((r) => new Date(r.at).getTime())
      for (let i = 1; i < timestamps.length; i += 1) {
        assert.ok(timestamps[i] >= timestamps[i - 1], 'the lead timeline is not oldest-first')
      }
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})

test('the lead timeline reads its actor from the audit columns', async () => {
  await inRollback(
    async (client) => {
      const lead = await aLead(client, { phone: '5125559999' })
      const rows = await repo.forLead(lead.id, client)
      const created = rows.find((r) => r.kind === 'created')

      assert.equal(created?.actor_id, TEST_ACTOR.id, 'created_by_id did not become the actor')
      assert.equal(created?.actor_name, TEST_ACTOR.name)
    },
    { actor: TEST_ACTOR.id }
  )
})

test('an email with no audit columns has no actor rather than a borrowed one', async () => {
  await inRollback(async (client) => {
    const tag = aTag()
    const email = `${tag}@dorado.test`
    const lead = await aLead(client, { phone: '5125558888', email })
    await client.query(
      `INSERT INTO media.emails (kind, status, to_address, subject, sent_at)
       VALUES ('promo', 'sent', $1, 'A note', now())`,
      [email]
    )

    const rows = await repo.forLead(lead.id, client)
    const sent = rows.find((r) => r.kind === 'email')
    assert.equal(sent?.actor_id, null)
    assert.equal(sent?.actor_name, null)
  })
})

test('the lead timeline is empty for an id that names no lead', async () => {
  await inRollback(async (client) => {
    assert.deepEqual(await repo.forLead('00000000-0000-4000-8000-00000000beef', client), [])
  })
})
