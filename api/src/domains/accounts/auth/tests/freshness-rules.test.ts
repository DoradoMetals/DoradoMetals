import { test } from 'vitest'
import assert from 'node:assert/strict'
import { sessionVerdict, sessionRole } from '#accounts/auth/rules.ts'

const NOW = Date.parse('2026-09-05T12:00:00Z')
const inHours = (h: number) => new Date(NOW + h * 3_600_000)

test('a session with no row is revoked - the cookie outlives the row it names', () => {
  assert.equal(
    sessionVerdict(undefined, NOW),
    'revoked',
    'the freshness read is what sees a revoked session; the signed cookie ' +
      'still parses for up to five minutes after the row is deleted'
  )
})

test('a live user is live, whether banned is false or never set', () => {
  assert.equal(sessionVerdict({ banned: false, ban_expires: null, role: 'user' }, NOW), 'live')
  assert.equal(sessionVerdict({ banned: null, ban_expires: null, role: 'user' }, NOW), 'live')
})

test('a ban with no expiry is a ban', () => {
  assert.equal(sessionVerdict({ banned: true, ban_expires: null, role: 'user' }, NOW), 'banned')
})

test('a ban that has not yet expired is a ban; one that has is not', () => {
  assert.equal(sessionVerdict({ banned: true, ban_expires: inHours(1), role: 'user' }, NOW), 'banned')
  assert.equal(
    sessionVerdict({ banned: true, ban_expires: inHours(-1), role: 'user' }, NOW),
    'live',
    "an elapsed ban is not a ban - better-auth's admin plugin clears it at the " +
      'next sign-in, so reading it as live is the same answer, sooner'
  )
})

test('a ban expiring exactly now has elapsed', () => {
  assert.equal(sessionVerdict({ banned: true, ban_expires: new Date(NOW), role: 'user' }, NOW), 'live')
})

test('the ban expiry is read from a string as well as a Date', () => {
  assert.equal(
    sessionVerdict({ banned: true, ban_expires: '2026-09-05T13:00:00Z', role: 'user' }, NOW),
    'banned'
  )
})

test('the role is the database row, and absent means no role at all', () => {
  assert.equal(sessionRole({ banned: false, ban_expires: null, role: 'admin' }), 'admin')
  assert.equal(sessionRole({ banned: false, ban_expires: null, role: null }), null)
  assert.equal(
    sessionRole(undefined),
    null,
    'no row is no role - a revoked session must not keep the cookie\'s admin'
  )
})
