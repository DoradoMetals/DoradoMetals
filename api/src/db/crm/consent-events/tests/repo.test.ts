import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { inRollback } from '#shared/testing/rollback.ts'
import { aLead, aUser, anUnknownId } from '#shared/testing/builders/index.ts'
import * as consentEvents from '#db/crm/consent-events/repo.ts'

afterAll(async () => {
  await pool.end()
})

const kindKeyOf = async (c: PoolClient, kind_id: string): Promise<string> => {
  const { rows } = await c.query<{ key: string }>(
    `SELECT key FROM crm.sms_consent_kinds WHERE id = $1`,
    [kind_id]
  )
  return rows[0]!.key
}

test('create resolves the kind by key and the database stamps the moment', async () => {
  await inRollback(async (c: PoolClient) => {
    const customer = await aUser(c)

    const written = await consentEvents.create(
      { user_id: customer.id, lead_id: null, kind: 'opt_in', method: 'web_form' },
      c
    )
    assert.equal(written.user_id, customer.id)
    assert.equal(written.method, 'web_form')
    assert.ok(written.id, 'no id came back')
    assert.ok(written.at, 'the database did not stamp the moment')
    assert.equal(await kindKeyOf(c, written.kind_id), 'opt_in')
  })
})

test('an opt-out is a row, so a withdrawal can be proved after the fact', async () => {
  await inRollback(async (c: PoolClient) => {
    const lead = await aLead(c)

    await consentEvents.create(
      { user_id: null, lead_id: lead.id, kind: 'opt_in', method: 'web_form' },
      c
    )
    const out = await consentEvents.create(
      { user_id: null, lead_id: lead.id, kind: 'opt_out', method: 'via_text' },
      c
    )
    assert.equal(await kindKeyOf(c, out.kind_id), 'opt_out')

    const history = await consentEvents.forSubject(null, lead.id, c)
    assert.equal(history.length, 2, 'the record lost one of the two decisions')
  })
})

test('forSubject answers only the asked-for subject, newest first', async () => {
  await inRollback(async (c: PoolClient) => {
    const mine = await aUser(c)
    const theirs = await aUser(c)

    const older = await consentEvents.create(
      { user_id: mine.id, lead_id: null, kind: 'opt_in', method: 'web_form' },
      c
    )
    const newer = await consentEvents.create(
      { user_id: mine.id, lead_id: null, kind: 'opt_out', method: 'via_text' },
      c
    )
    await consentEvents.create(
      { user_id: theirs.id, lead_id: null, kind: 'opt_in', method: 'verbal' },
      c
    )

    await c.query(`UPDATE crm.sms_consent_events SET at = at - interval '1 hour' WHERE id = $1`, [
      older.id,
    ])

    const rows = await consentEvents.forSubject(mine.id, null, c)
    assert.deepEqual(
      rows.map((r) => r.id),
      [newer.id, older.id]
    )
    assert.deepEqual(await consentEvents.forSubject(anUnknownId(), null, c), [])
  })
})

test('a method with no recorded channel is accepted as null', async () => {
  await inRollback(async (c: PoolClient) => {
    const customer = await aUser(c)
    const written = await consentEvents.create(
      { user_id: customer.id, lead_id: null, kind: 'opt_out', method: null },
      c
    )
    assert.equal(written.method, null)
  })
})

const optInKindId = async (c: PoolClient): Promise<string> => {
  const { rows } = await c.query<{ id: string }>(
    `SELECT id FROM crm.sms_consent_kinds WHERE key = 'opt_in'`
  )
  return rows[0]!.id
}

test('the database refuses an event with two subjects', async () => {
  await inRollback(async (c: PoolClient) => {
    const customer = await aUser(c)
    const lead = await aLead(c)

    await assert.rejects(
      c.query(
        `INSERT INTO crm.sms_consent_events (user_id, lead_id, kind_id) VALUES ($1, $2, $3)`,
        [customer.id, lead.id, await optInKindId(c)]
      ),
      /sms_consent_events_one_subject/
    )
  })
})

test('the database refuses an event with no subject', async () => {
  await inRollback(async (c: PoolClient) => {
    await assert.rejects(
      c.query(`INSERT INTO crm.sms_consent_events (kind_id) VALUES ($1)`, [await optInKindId(c)]),
      /sms_consent_events_one_subject/
    )
  })
})

test('the database refuses a method it does not know', async () => {
  await inRollback(async (c: PoolClient) => {
    const customer = await aUser(c)

    await assert.rejects(
      c.query(
        `INSERT INTO crm.sms_consent_events (user_id, kind_id, method) VALUES ($1, $2, 'carrier')`,
        [customer.id, await optInKindId(c)]
      ),
      /sms_consent_events_method_is_known/
    )
  })
})

test('deleting the customer takes the consent record with it', async () => {
  await inRollback(async (c: PoolClient) => {
    const customer = await aUser(c)
    await consentEvents.create(
      { user_id: customer.id, lead_id: null, kind: 'opt_in', method: 'web_form' },
      c
    )

    await c.query(`DELETE FROM auth.users WHERE id = $1`, [customer.id])
    assert.deepEqual(await consentEvents.forSubject(customer.id, null, c), [])
  })
})
