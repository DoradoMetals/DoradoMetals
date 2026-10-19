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

test('with no AUTH_COOKIE_DOMAIN, hosts sharing a parent domain share the cookie', () => {
  const o = advancedCookieOptions({
    FRONTEND_URL: 'https://uat.doradometals.com',
    BETTER_AUTH_URL: 'https://uat-api.doradometals.com',
  })
  assert.deepEqual(o.crossSubDomainCookies, { enabled: true, domain })
  assert.equal(o.useSecureCookies, true)
})

test('one host, localhost and unrelated hosts stay host-scoped', () => {
  assert.deepEqual(
    advancedCookieOptions({
      FRONTEND_URL: 'http://localhost:3010',
      BETTER_AUTH_URL: 'http://localhost:5010',
    }),
    {}
  )
  assert.deepEqual(
    advancedCookieOptions({ FRONTEND_URL: 'https://a.com', BETTER_AUTH_URL: 'https://b.com' }),
    {}
  )
})

test('a Railway pair derives no domain (public suffix)', () => {
  assert.deepEqual(
    advancedCookieOptions({
      FRONTEND_URL: 'https://web-prod.up.railway.app',
      BETTER_AUTH_URL: 'https://api-prod.up.railway.app',
    }),
    {}
  )
})

test('an explicit AUTH_COOKIE_DOMAIN wins over the derived one', () => {
  const o = advancedCookieOptions({
    AUTH_COOKIE_DOMAIN: '.other.com',
    FRONTEND_URL: 'https://uat.doradometals.com',
    BETTER_AUTH_URL: 'https://uat-api.doradometals.com',
  })
  assert.deepEqual(o.crossSubDomainCookies, { enabled: true, domain: '.other.com' })
})
