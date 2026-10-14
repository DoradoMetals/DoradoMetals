import { describe, expect, test, vi } from 'vitest'

const redirect = vi.fn()
vi.mock('next/navigation', () => ({ redirect }))

const { default: Page } = await import('../page')

describe('the admin landing', () => {
  test('redirects to the pricing spots route', () => {
    Page()
    expect(redirect).toHaveBeenCalledWith('/admin/pricing/spots')
  })
})
