import { test, afterEach } from 'vitest'
import assert from 'node:assert/strict'

import { credentials } from '#providers/sms/twilio.ts'

const KEYS = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'] as const

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
})

test('with every key present it constructs', () => {
  for (const key of KEYS) set(key, `value-for-${key}`)
  assert.deepEqual(credentials(), {
    account_sid: 'value-for-TWILIO_ACCOUNT_SID',
    auth_token: 'value-for-TWILIO_AUTH_TOKEN',
    from_number: 'value-for-TWILIO_FROM_NUMBER',
  })
})

test('each missing key in turn refuses, and the error names it', () => {
  for (const absent of KEYS) {
    for (const key of KEYS) set(key, key === absent ? undefined : 'set')
    assert.throws(credentials, (err: Error) => {
      assert.match(err.message, new RegExp(absent))
      return true
    })
  }
})

test('a blank key counts as missing', () => {
  for (const key of KEYS) set(key, 'set')
  set('TWILIO_AUTH_TOKEN', '   ')
  assert.throws(credentials, /TWILIO_AUTH_TOKEN/)
})

test('with no keys at all the error names all three', () => {
  for (const key of KEYS) set(key, undefined)
  assert.throws(credentials, (err: Error) => {
    for (const key of KEYS) assert.match(err.message, new RegExp(key))
    return true
  })
})
