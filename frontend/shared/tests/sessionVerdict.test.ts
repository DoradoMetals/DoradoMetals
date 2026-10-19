import { describe, expect, test } from 'vitest'

import { sessionVerdict } from '../hooks/sessionVerdict'

describe('sessionVerdict', () => {
  test('a user is in, even while a refetch is pending or has failed', () => {
    expect(sessionVerdict({ user: { role: 'admin' }, isPending: true })).toBe('in')
    expect(
      sessionVerdict({ user: { role: 'admin' }, error: { status: 500 }, isPending: false })
    ).toBe('in')
  })
  test('pending is not signed out', () => {
    expect(sessionVerdict({ user: null, isPending: true })).toBe('pending')
  })
  test('a failed fetch with no user keeps the state and retries', () => {
    expect(sessionVerdict({ user: null, error: {}, isPending: false })).toBe('unknown')
    expect(sessionVerdict({ user: null, error: { status: 503 }, isPending: false })).toBe('unknown')
  })
  test('an answered no-session and a 401 are definitive', () => {
    expect(sessionVerdict({ user: null, isPending: false })).toBe('out')
    expect(sessionVerdict({ user: null, error: { status: 401 }, isPending: false })).toBe('out')
  })
})
