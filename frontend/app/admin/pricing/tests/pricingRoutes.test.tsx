import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { protectedRoutes } from '@/shared/types/routes'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/admin/pricing/rates',
  redirect: vi.fn(),
}))

const { PricingHeader } = await import('../_components')

describe('the pricing header', () => {
  test('marks the current section and moves to the other', () => {
    render(<PricingHeader section="rates" mobile={false} description="Rates" />)
    expect(screen.getByRole('button', { name: 'Rates' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('button', { name: 'Spots' }).getAttribute('aria-current')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Spots' }))
    expect(push).toHaveBeenCalledWith('/admin/pricing/spots')
  })

  test('the routes are admin only', () => {
    expect(protectedRoutes.adminPricingSpots.roles).toEqual(['admin'])
    expect(protectedRoutes.adminPricingRates.roles).toEqual(['admin'])
  })
})
