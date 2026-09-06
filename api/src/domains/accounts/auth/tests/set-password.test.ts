import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  PASSWORD_SESSION_FRESH_SECONDS,
  assertMaySetPassword,
} from '#accounts/auth/rules.ts'

const NOW = Date.parse('2026-09-05T12:00:00Z')
const agoSeconds = (s: number) => new Date(NOW - s * 1000)

test('a fresh, named session may set a password', () => {
  assertMaySetPassword(false, agoSeconds(60), NOW)
  assertMaySetPassword(undefined, agoSeconds(0), NOW)
})

test('an anonymous visitor is refused - the endpoint would give the throwaway a password', () => {
  assert.throws(
    () => assertMaySetPassword(true, agoSeconds(10), NOW),
    /anonymous visitor cannot be given a password/
  )
})

test('a session older than the freshness window is refused', () => {
  assert.throws(
    () => assertMaySetPassword(false, agoSeconds(PASSWORD_SESSION_FRESH_SECONDS + 1), NOW),
    /sign in again/,
    'a session alone used to mint a permanent credential for a Google or ' +
      'magic-link account, with no current password and no re-authentication'
  )
  assert.throws(
    () => assertMaySetPassword(false, agoSeconds(60 * 60 * 24), NOW),
    /sign in again/
  )
})

test('a session with no createdAt is refused rather than treated as fresh', () => {
  assert.throws(() => assertMaySetPassword(false, undefined, NOW), /needs a signed-in caller/)
  assert.throws(() => assertMaySetPassword(false, null, NOW), /needs a signed-in caller/)
})

test('a session stamped in the future is refused, not waved through', () => {
  assert.throws(() => assertMaySetPassword(false, new Date(NOW + 60_000), NOW), /sign in again/)
})
