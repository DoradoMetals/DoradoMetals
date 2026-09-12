import { test } from 'vitest'
import assert from 'node:assert/strict'

import { payload, sign, verify } from '#providers/communications/twilio/signature.ts'

// Twilio's worked example. The concatenation is the string their documentation
// prints; EXPECTED is what HMAC-SHA1 of it under "12345" is. A signature this
// file computed for itself would prove only self-consistency, so the primitive
// is pinned separately against a standard HMAC-SHA1 vector below.
const URL = 'https://mycompany.com/myapp.php?foo=1&bar=2'
const PARAMS = {
  Digits: '1234',
  To: '+18005551212',
  From: '+14158675310',
  Caller: '+14158675310',
  CallSid: 'CA1234567890ABCDE',
}
const TOKEN = '12345'
const EXPECTED = 'GvWf1cFY/Q7PnoempGyD5oXAezc='

test('the signed string is the URL then every parameter sorted by name', () => {
  assert.equal(
    payload(URL, PARAMS),
    'https://mycompany.com/myapp.php?foo=1&bar=2' +
      'CallSidCA1234567890ABCDECaller+14158675310Digits1234From+14158675310To+18005551212'
  )
})

test('the published example signs and verifies', () => {
  assert.equal(sign(URL, PARAMS, TOKEN), EXPECTED)
  assert.equal(verify(URL, PARAMS, EXPECTED, TOKEN), true)
})

test('parameter order in the object does not change the signature', () => {
  const reordered = {
    CallSid: PARAMS.CallSid,
    To: PARAMS.To,
    Caller: PARAMS.Caller,
    From: PARAMS.From,
    Digits: PARAMS.Digits,
  }
  assert.equal(sign(URL, reordered, TOKEN), EXPECTED)
})

test('a tampered body is refused', () => {
  assert.equal(verify(URL, { ...PARAMS, Digits: '1235' }, EXPECTED, TOKEN), false)
})

test('an added parameter is refused', () => {
  assert.equal(verify(URL, { ...PARAMS, Body: 'hello' }, EXPECTED, TOKEN), false)
})

test('a tampered URL is refused', () => {
  assert.equal(verify(`${URL}&baz=3`, PARAMS, EXPECTED, TOKEN), false)
  assert.equal(verify('https://evil.example/myapp.php?foo=1&bar=2', PARAMS, EXPECTED, TOKEN), false)
})

test('a wrong token is refused', () => {
  assert.equal(verify(URL, PARAMS, EXPECTED, '54321'), false)
})

test('an empty or short signature is refused rather than throwing', () => {
  assert.equal(verify(URL, PARAMS, '', TOKEN), false)
  assert.equal(verify(URL, PARAMS, 'short', TOKEN), false)
})

// The primitive itself, against a vector this repository did not compute: a
// signature the module checks against its own output would pass even if the
// hash were wrong.
test('the underlying keyed hash is HMAC-SHA1', () => {
  const known = 'de7c9b85b8b78aa6bc8a7a36f70a90701c9db4d9'
  const signed = sign('The quick brown fox jumps over the lazy dog', {}, 'key')
  assert.equal(Buffer.from(signed, 'base64').toString('hex'), known)
})
