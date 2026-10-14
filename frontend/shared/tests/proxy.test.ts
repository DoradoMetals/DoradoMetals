import { describe, expect, test } from 'vitest'
import { NextRequest } from 'next/server'
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'

import { config, proxy } from '../../proxy'
import {
  PROXY_GUARDED_PREFIXES,
  SECURE_SESSION_COOKIE,
  SESSION_COOKIE,
} from '../utils/sessionCookie'

const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url })

const call = (path: string, cookie?: string) =>
  proxy(
    new NextRequest(`http://localhost:3000${path}`, {
      headers: cookie ? { cookie } : {},
    })
  )

describe('the proxy matcher', () => {
  test.each(['/admin', '/admin/orders/abc', '/admin/pricing/spots', '/account', '/account/orders'])(
    'guards %s',
    (url) => {
      expect(matches(url)).toBe(true)
    }
  )

  test.each([
    '/',
    '/auth/sign-in',
    '/auth/verify/step-up',
    '/settings/email',
    '/privacy-policy',
    '/administrator',
    '/accounting',
    '/_next/static/chunk.js',
    '/api/anything',
  ])('leaves %s alone', (url) => {
    expect(matches(url)).toBe(false)
  })

  test('the matcher covers exactly the guarded prefixes', () => {
    expect(config.matcher).toEqual(PROXY_GUARDED_PREFIXES.map((prefix) => `${prefix}/:path*`))
  })
})

describe('the proxy', () => {
  test('sends a request with no session cookie to sign-in, carrying next', () => {
    const res = call('/admin/pricing/spots?tab=a')
    expect(res.status).toBe(307)
    const location = new URL(res.headers.get('location') as string)
    expect(location.pathname).toBe('/auth/sign-in')
    expect(location.searchParams.get('next')).toBe('/admin/pricing/spots?tab=a')
  })

  test('lets a request with the session cookie through', () => {
    const res = call('/admin', `${SESSION_COOKIE}=abc`)
    expect(res.headers.get('location')).toBeNull()
    expect(res.headers.get('x-middleware-next')).toBe('1')
  })

  test('accepts the secure-prefixed cookie', () => {
    const res = call('/account', `${SECURE_SESSION_COOKIE}=abc`)
    expect(res.headers.get('location')).toBeNull()
  })

  test('an unrelated cookie is not a session', () => {
    const res = call('/admin', 'theme=dark')
    expect(res.status).toBe(307)
  })
})
