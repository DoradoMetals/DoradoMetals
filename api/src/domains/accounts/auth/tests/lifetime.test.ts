import { test } from 'vitest'
import assert from 'node:assert/strict'

import { sessionLifetime } from '#accounts/auth/lifetime.ts'

test('a session lasts 30 days, refreshes daily, and the cookie cache stays five minutes (ruling 90)', () => {
  assert.equal(sessionLifetime.expiresIn, 60 * 60 * 24 * 30)
  assert.equal(sessionLifetime.updateAge, 60 * 60 * 24)
  assert.deepEqual(sessionLifetime.cookieCache, { enabled: true, maxAge: 300 })
})
