import { test, afterAll, afterEach } from 'vitest'
import assert from 'node:assert/strict'
import pool from '#pool'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aUser } from '#shared/testing/builders/index.ts'
import * as service from '#crm/calls/service.ts'
import * as presence from '#crm/calls/presence.ts'

afterAll(async () => {
  await pool.end()
})

afterEach(() => {
  presence.reset()
})

const VOICE_KEYS = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_API_KEY_SID',
  'TWILIO_API_KEY_SECRET',
  'TWILIO_TWIML_APP_SID',
] as const

const saved = new Map<string, string | undefined>()
function setEnv(name: string, value: string): void {
  if (!saved.has(name)) saved.set(name, process.env[name])
  process.env[name] = value
}
afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  saved.clear()
})

function withVoiceKeys(): void {
  setEnv('TWILIO_ACCOUNT_SID', 'ACtest')
  setEnv('TWILIO_API_KEY_SID', 'SKtest')
  setEnv('TWILIO_API_KEY_SECRET', 'shh')
  setEnv('TWILIO_TWIML_APP_SID', 'APtest')
}

async function anEmployee(client: import('pg').PoolClient, user_id: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO auth.employees (user_id, role, enabled) VALUES ($1, 'agent', true) RETURNING id`,
    [user_id]
  )
  return rows[0].id
}

test('issueToken uses the employee id as identity and reports a real expiry', async () => {
  withVoiceKeys()
  await inPinnedTransaction(
    async (client) => {
      const user = await aUser(client)
      const employee_id = await anEmployee(client, user.id)

      const result = await service.issueToken(user.id)
      assert.equal(result.identity, employee_id)
      assert.ok(new Date(result.expires_at).getTime() > Date.now())
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})

test('a caller with no employee record is refused', async () => {
  withVoiceKeys()
  await inPinnedTransaction(
    async (client) => {
      const user = await aUser(client)
      await assert.rejects(() => service.issueToken(user.id))
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})

test('presence: online after markOnline, gone after setPresence(false)', async () => {
  await inPinnedTransaction(
    async (client) => {
      const user = await aUser(client)
      const employee_id = await anEmployee(client, user.id)

      await service.setPresence(user.id, true)
      assert.ok(presence.onlineEmployeeIds().includes(employee_id))

      await service.setPresence(user.id, false)
      assert.ok(!presence.onlineEmployeeIds().includes(employee_id))
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})

test('an inbound call with no admin online goes straight to voicemail TwiML', async () => {
  await inPinnedTransaction(
    async () => {
      const xml = await service.handleTwiml({
        CallSid: 'CAvoicemail0000000000000000000001',
        From: '+15125550001',
        To: '+15125550000',
      })
      assert.ok(xml.includes('<Record'))
      assert.ok(xml.includes('transcribe="true"'))
    },
    { lock: LOCKS.ORDERS, actor: TEST_ACTOR.id }
  )
})

test('an inbound call with an admin online rings that client', async () => {
  await inPinnedTransaction(
    async (client) => {
      const user = await aUser(client)
      const employee_id = await anEmployee(client, user.id)
      await service.setPresence(user.id, true)

      const xml = await service.handleTwiml({
        CallSid: 'CAringing00000000000000000000001',
        From: '+15125550001',
        To: '+15125550000',
      })
      assert.ok(xml.includes(`<Client>${employee_id}</Client>`))
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})

test('a dial action reporting no answer falls back to voicemail', async () => {
  await inPinnedTransaction(
    async () => {
      const xml = await service.handleTwiml({
        CallSid: 'CAnoanswer0000000000000000000001',
        DialCallStatus: 'no-answer',
      })
      assert.ok(xml.includes('<Record'))
    },
    { lock: LOCKS.ORDERS, actor: TEST_ACTOR.id }
  )
})

test('a completed dial ends the call cleanly', async () => {
  await inPinnedTransaction(
    async () => {
      const xml = await service.handleTwiml({
        CallSid: 'CAcompleted000000000000000000001',
        DialCallStatus: 'completed',
      })
      assert.equal(xml, '<?xml version="1.0" encoding="UTF-8"?><Response/>')
    },
    { lock: LOCKS.ORDERS, actor: TEST_ACTOR.id }
  )
})

test('the recording action stores recording_url and the voicemail status', async () => {
  await inPinnedTransaction(
    async (client) => {
      const sid = 'CArecorded0000000000000000000001'
      await client.query(
        `INSERT INTO crm.calls (provider, provider_sid, direction, from_number, to_number, status)
         VALUES ('twilio', $1, 'inbound', '+15125550001', '+15125550000', 'ringing')`,
        [sid]
      )
      await service.handleTwiml({ CallSid: sid, RecordingUrl: 'https://api.twilio.com/r.mp3' })

      const { rows } = await client.query<{ status: string; recording_url: string }>(
        'SELECT status, recording_url FROM crm.calls WHERE provider_sid = $1',
        [sid]
      )
      assert.equal(rows[0].status, 'voicemail')
      assert.equal(rows[0].recording_url, 'https://api.twilio.com/r.mp3')
    },
    { lock: LOCKS.ORDERS, actor: TEST_ACTOR.id }
  )
})

test('an outbound call places the leg to the resolved user phone', async () => {
  await inPinnedTransaction(
    async (client) => {
      const phone = '+15125559301'
      const user = await aUser(client, { phone_number: phone })
      const employee_id = await anEmployee(client, user.id)

      const xml = await service.handleTwiml({
        CallSid: 'CAoutbound0000000000000000000001',
        From: `client:${employee_id}`,
        To: user.id,
      })
      assert.ok(xml.includes(`<Number>${phone}</Number>`))
    },
    { lock: LOCKS.USERS, actor: TEST_ACTOR.id }
  )
})
