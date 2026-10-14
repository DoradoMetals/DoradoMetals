import { test } from 'vitest'
import assert from 'node:assert/strict'

import { advancedCookieOptions } from '#accounts/auth/cookies.ts'

const domain = '.doradometals.com'

test('unset or blank domain leaves cookies host-scoped', () => {
  assert.deepEqual(advancedCookieOptions({}), {})
  assert.deepEqual(advancedCookieOptions({ AUTH_COOKIE_DOMAIN: '  ' }), {})
})

test('a domain scopes the cookie to the parent domain', () => {
  const o = advancedCookieOptions({ AUTH_COOKIE_DOMAIN: domain })
  assert.deepEqual(o.crossSubDomainCookies, { enabled: true, domain })
})

test('https auth url makes the cookie secure, whatever NODE_ENV is', () => {
  const o = advancedCookieOptions({
    AUTH_COOKIE_DOMAIN: domain,
    NODE_ENV: 'staging',
    BETTER_AUTH_URL: 'https://uat-api.doradometals.com',
  })
  assert.equal(o.useSecureCookies, true)
})

test('http auth url makes the cookie not secure', () => {
  const o = advancedCookieOptions({
    AUTH_COOKIE_DOMAIN: domain,
    BETTER_AUTH_URL: 'http://localhost:5000',
  })
  assert.equal(o.useSecureCookies, false)
})

test('falls back to FRONTEND_URL, and omits the key when both are unset', () => {
  assert.equal(
    advancedCookieOptions({
      AUTH_COOKIE_DOMAIN: domain,
      FRONTEND_URL: 'https://www.doradometals.com',
    }).useSecureCookies,
    true
  )
  assert.equal('useSecureCookies' in advancedCookieOptions({ AUTH_COOKIE_DOMAIN: domain }), false)
})
