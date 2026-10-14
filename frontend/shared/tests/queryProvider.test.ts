import { describe, expect, test } from 'vitest'
import { ApiError } from '@dorado/client'

import { makeQueryClient, shouldRetry } from '../providers/QueryProvider'

describe('the query defaults', () => {
  test('data stays fresh for five minutes', () => {
    expect(makeQueryClient().getDefaultOptions().queries?.staleTime).toBe(300000)
  })

  test('a 4xx is never retried', () => {
    expect(shouldRetry(0, new ApiError(404, 'missing', null))).toBe(false)
    expect(shouldRetry(0, new ApiError(401, 'no', null))).toBe(false)
  })

  test('a 5xx or network error retries twice', () => {
    expect(shouldRetry(0, new ApiError(500, 'boom', null))).toBe(true)
    expect(shouldRetry(1, new TypeError('network'))).toBe(true)
    expect(shouldRetry(2, new TypeError('network'))).toBe(false)
  })

  test('a mutation is never retried', () => {
    expect(makeQueryClient().getDefaultOptions().mutations?.retry).toBe(false)
  })
})
