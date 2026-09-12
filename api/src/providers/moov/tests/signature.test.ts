import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  sign,
  signingString,
  verifyMoovSignature,
} from '#providers/moov/signature.ts'

const SECRET = 'whsec_moov_test'
const BODY = '{"eventID":"evt_1","type":"transfer.updated"}'
const NOW = 1_757_000_000_000
const STAMP = String(NOW)
const NONCE = 'nonce-1'
const HOOK = 'hook-1'

const good = (): string => sign(SECRET, signingString(STAMP, NONCE, HOOK, BODY))

test('a delivery signed with the endpoint secret verifies', () => {
  assert.equal(verifyMoovSignature(SECRET, BODY, good(), STAMP, NONCE, HOOK, NOW), true)
})

test('a delivery signed with another secret is refused', () => {
  const forged = sign('whsec_not_ours', signingString(STAMP, NONCE, HOOK, BODY))
  assert.equal(verifyMoovSignature(SECRET, BODY, forged, STAMP, NONCE, HOOK, NOW), false)
})

test('the same signature over a different body is refused', () => {
  const tampered = '{"eventID":"evt_1","type":"transfer.completed"}'
  assert.equal(verifyMoovSignature(SECRET, tampered, good(), STAMP, NONCE, HOOK, NOW), false)
})

test('a captured delivery replayed an hour later is refused', () => {
  assert.equal(
    verifyMoovSignature(SECRET, BODY, good(), STAMP, NONCE, HOOK, NOW + 60 * 60 * 1000),
    false
  )
})

test('a missing header is refused rather than skipped', () => {
  assert.equal(verifyMoovSignature(SECRET, BODY, undefined, STAMP, NONCE, HOOK, NOW), false)
  assert.equal(verifyMoovSignature(SECRET, BODY, good(), undefined, NONCE, HOOK, NOW), false)
  assert.equal(verifyMoovSignature(SECRET, BODY, good(), STAMP, undefined, HOOK, NOW), false)
  assert.equal(verifyMoovSignature(SECRET, BODY, good(), STAMP, NONCE, undefined, NOW), false)
})

test('no configured secret refuses everything', () => {
  assert.equal(verifyMoovSignature('', BODY, good(), STAMP, NONCE, HOOK, NOW), false)
})
