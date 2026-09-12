import { test, afterEach } from 'vitest'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

import * as voice from '#providers/communications/twilio/voice.ts'

const KEYS = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_API_KEY_SID',
  'TWILIO_API_KEY_SECRET',
  'TWILIO_TWIML_APP_SID',
] as const

const saved = new Map<string, string | undefined>()
const set = (name: string, value: string | undefined) => {
  if (!saved.has(name)) saved.set(name, process.env[name])
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}
const withKeys = () => {
  set('TWILIO_ACCOUNT_SID', 'ACtestaccount')
  set('TWILIO_API_KEY_SID', 'SKtestkey')
  set('TWILIO_API_KEY_SECRET', 'shhh-secret')
  set('TWILIO_TWIML_APP_SID', 'APtestapp')
}

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  saved.clear()
})

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))

test('each missing voice key in turn refuses, and the error names it', () => {
  for (const absent of KEYS) {
    withKeys()
    set(absent, undefined)
    assert.throws(() => voice.accessToken('employee-1'), new RegExp(absent))
  }
})

test('the token header is the Twilio-flavoured HS256 JWT header', () => {
  withKeys()
  const [header] = voice.accessToken('employee-1').split('.')
  assert.deepEqual(decode(header), { typ: 'JWT', alg: 'HS256', cty: 'twilio-fpa;v=1' })
})

test('the claims carry the identity and both voice grants', () => {
  withKeys()
  const claims = decode(voice.accessToken('employee-1').split('.')[1])

  assert.equal(claims.iss, 'SKtestkey')
  assert.equal(claims.sub, 'ACtestaccount')
  assert.equal(claims.grants.identity, 'employee-1')
  assert.deepEqual(claims.grants.voice, {
    outgoing: { application_sid: 'APtestapp' },
    incoming: { allow: true },
  })
  assert.match(claims.jti, /^SKtestkey-\d+$/)
})

test('the TTL is short and the token is not already expired', () => {
  withKeys()
  const claims = decode(voice.accessToken('employee-1').split('.')[1])
  const now = Math.floor(Date.now() / 1000)

  assert.ok(claims.iat <= now + 1)
  assert.equal(claims.exp - claims.iat, 600)
  assert.ok(claims.exp > now)
})

test('the signature is HS256 over header.claims with the API key secret', () => {
  withKeys()
  const token = voice.accessToken('employee-1')
  const [header, claims, mac] = token.split('.')
  const expected = crypto
    .createHmac('sha256', 'shhh-secret')
    .update(`${header}.${claims}`)
    .digest('base64url')

  assert.equal(mac, expected)
})

test('emptyResponse is the TwiML a webhook answers with', () => {
  assert.equal(voice.emptyResponse(), '<?xml version="1.0" encoding="UTF-8"?><Response/>')
})

test('dialNumber escapes both the callee and the caller id', () => {
  assert.equal(
    voice.dialNumber('+15125550199', '+15125550134'),
    '<?xml version="1.0" encoding="UTF-8"?><Response>' +
      '<Dial callerId="+15125550134"><Number>+15125550199</Number></Dial></Response>'
  )
  const nasty = voice.dialNumber('</Number><Hangup/>', 'a"b&c')
  assert.ok(!nasty.includes('<Hangup/>'))
  assert.ok(nasty.includes('&lt;/Number&gt;'))
  assert.ok(nasty.includes('a&quot;b&amp;c'))
})

test('dialClients rings every identity with the timeout and action url', () => {
  assert.equal(
    voice.dialClients(['emp-1', 'emp-2'], 20, 'https://api.example/api/calls/status?leg=1&x=2'),
    '<?xml version="1.0" encoding="UTF-8"?><Response>' +
      '<Dial timeout="20" action="https://api.example/api/calls/status?leg=1&amp;x=2">' +
      '<Client>emp-1</Client><Client>emp-2</Client></Dial></Response>'
  )
  assert.ok(voice.dialClients([], 20, 'https://api.example/x').includes('<Dial timeout="20"'))
})

test('recordVoicemail asks for a transcription and names both callbacks', () => {
  const twiml = voice.recordVoicemail(
    'https://api.example/api/calls/status',
    'https://api.example/api/calls/transcription'
  )
  assert.ok(twiml.includes('action="https://api.example/api/calls/status"'))
  assert.ok(twiml.includes('transcribe="true"'))
  assert.ok(twiml.includes('transcribeCallback="https://api.example/api/calls/transcription"'))
})
