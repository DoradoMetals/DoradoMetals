import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  eventFrom,
  header,
  sign,
  signedContent,
  signingKey,
  verify,
} from '#providers/resend/resend-webhook.ts'

// Hand-written from Resend's documented Svix scheme: the key is the base64
// body of `whsec_`, the signed content is `id.timestamp.body`, HMAC-SHA256,
// base64. The expected value below was NOT produced by the code under test.
const SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw'
const ID = 'msg_2VeQjHPCLLHPz9zWLKwcxMKRvCF'
const TIMESTAMP = '1757548800'
const NOW = 1_757_548_800_000
const BODY =
  '{"type":"email.delivered","created_at":"2026-09-11T00:00:00.000Z","data":' +
  '{"email_id":"49a3999c-0ce1-4ea6-ab68-afcd6dc2e794","created_at":"2026-09-11T00:00:00.000Z",' +
  '"from":"Dorado <orders@doradometals.com>","to":["customer@example.com"],' +
  '"subject":"Your order"}}'
const EXPECTED = '2NQGkO9RP3yMV8DZqa/OusqeQagSfvfkSLYbRt8ertw='

test('the signing key is the base64 body of the whsec_ secret', () => {
  assert.deepEqual(signingKey(SECRET), Buffer.from(SECRET.slice('whsec_'.length), 'base64'))
})

test('the signed content is id.timestamp.body', () => {
  assert.equal(signedContent(ID, TIMESTAMP, BODY), `${ID}.${TIMESTAMP}.${BODY}`)
})

test('the signature matches the fixture computed from the documented scheme', () => {
  assert.equal(sign(SECRET, ID, TIMESTAMP, BODY), EXPECTED)
  assert.equal(header(SECRET, ID, TIMESTAMP, BODY), `v1,${EXPECTED}`)
})

test('a delivery carrying that signature verifies', () => {
  assert.equal(verify(SECRET, BODY, ID, TIMESTAMP, `v1,${EXPECTED}`, NOW), true)
})

test('one good candidate among several is enough', () => {
  const many = `v1,bm90LWEtc2lnbmF0dXJlLWF0LWFsbC1ub3BlLW5vcGU= v1,${EXPECTED}`
  assert.equal(verify(SECRET, BODY, ID, TIMESTAMP, many, NOW), true)
})

test('an unknown signature version is not accepted', () => {
  assert.equal(verify(SECRET, BODY, ID, TIMESTAMP, `v2,${EXPECTED}`, NOW), false)
})

test('another secret, another id and a tampered body are all refused', () => {
  const other = sign('whsec_bm90LW91cnMtYXQtYWxsLW5vcGUtbm9wZQ==', ID, TIMESTAMP, BODY)
  assert.equal(verify(SECRET, BODY, ID, TIMESTAMP, `v1,${other}`, NOW), false)
  assert.equal(verify(SECRET, BODY, 'msg_other', TIMESTAMP, `v1,${EXPECTED}`, NOW), false)
  assert.equal(
    verify(SECRET, BODY.replace('delivered', 'bounced'), ID, TIMESTAMP, `v1,${EXPECTED}`, NOW),
    false
  )
})

test('a captured delivery replayed an hour later is refused', () => {
  assert.equal(verify(SECRET, BODY, ID, TIMESTAMP, `v1,${EXPECTED}`, NOW + 3_600_000), false)
})

test('a missing header, an empty body and no configured secret are refused', () => {
  assert.equal(verify(SECRET, BODY, undefined, TIMESTAMP, `v1,${EXPECTED}`, NOW), false)
  assert.equal(verify(SECRET, BODY, ID, undefined, `v1,${EXPECTED}`, NOW), false)
  assert.equal(verify(SECRET, BODY, ID, TIMESTAMP, undefined, NOW), false)
  assert.equal(verify(SECRET, '', ID, TIMESTAMP, `v1,${EXPECTED}`, NOW), false)
  assert.equal(verify('', BODY, ID, TIMESTAMP, `v1,${EXPECTED}`, NOW), false)
})

test('a delivered event parses to the message it names', () => {
  const event = eventFrom(ID, BODY)
  assert.deepEqual(event, {
    event_id: ID,
    type: 'email.delivered',
    email_id: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794',
    occurred_at: '2026-09-11T00:00:00.000Z',
    bounce_reason: null,
  })
})

test('a bounce carries its reason', () => {
  const event = eventFrom(
    ID,
    JSON.stringify({
      type: 'email.bounced',
      created_at: '2026-09-11T01:00:00.000Z',
      data: {
        email_id: 'b1',
        bounce: {
          message: 'The recipient does not exist.',
          type: 'Permanent',
          subType: 'General',
        },
      },
    })
  )
  assert.equal(event?.type, 'email.bounced')
  assert.equal(event?.bounce_reason, 'The recipient does not exist.')
})

test('a payload naming no message, and one that is not JSON, parse to null', () => {
  assert.equal(eventFrom(ID, JSON.stringify({ type: 'email.delivered', data: {} })), null)
  assert.equal(eventFrom(ID, JSON.stringify({ data: { email_id: 'x' } })), null)
  assert.equal(eventFrom(ID, 'not json at all'), null)
})
