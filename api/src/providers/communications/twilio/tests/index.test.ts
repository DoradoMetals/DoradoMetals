import { test, afterEach } from 'vitest'
import assert from 'node:assert/strict'

import * as sms from '#providers/communications/twilio/index.ts'
import * as fake from '#providers/communications/twilio/fake.ts'

const KEYS = [
  'SMS_PROVIDER',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_FROM_NUMBER',
] as const

const saved = new Map<string, string | undefined>()
const set = (name: string, value: string | undefined) => {
  if (!saved.has(name)) saved.set(name, process.env[name])
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  saved.clear()
  fake.reset()
})

test('the module imports with no Twilio key set at all', () => {
  for (const key of KEYS) set(key, undefined)
  assert.equal(typeof sms.send, 'function')
  assert.equal(typeof sms.verifySignature, 'function')
  assert.equal(typeof sms.parseInbound, 'function')
  assert.equal(typeof sms.parseStatus, 'function')
})

test('with no SMS_PROVIDER the fake is selected and sending works', async () => {
  for (const key of KEYS) set(key, undefined)
  assert.equal(sms.isFake(), true)

  await sms.send('+15125550199', 'code 654321')
  assert.equal(fake.lastCodeTo('+15125550199'), '654321')
})

test('SMS_PROVIDER=twilio selects the real adapter, which refuses without keys', async () => {
  for (const key of KEYS) set(key, undefined)
  set('SMS_PROVIDER', 'twilio')

  assert.equal(sms.isFake(), false)
  await assert.rejects(() => sms.send('+15125550199', 'code 654321'), /TWILIO_ACCOUNT_SID/)
})

test('an unknown SMS_PROVIDER falls back to the fake rather than failing to boot', () => {
  set('SMS_PROVIDER', 'carrier-pigeon')
  assert.equal(sms.isFake(), true)
})

test('the parsers are the Twilio shape whichever adapter is selected', () => {
  const form = { MessageSid: 'SMabc', From: '+15125550199', To: '+15125550134', Body: 'hi' }
  set('SMS_PROVIDER', 'twilio')
  const real = sms.parseInbound(form)
  set('SMS_PROVIDER', 'fake')
  assert.deepEqual(sms.parseInbound(form), real)
})
