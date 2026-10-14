import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import { protectedRoutes } from '@/shared/types/routes'

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/pricing/rates',
  redirect: vi.fn(),
}))

const { PricingNav } = await import('../_components')
const { default: SpotsPage } = await import('../spots/page')
const { default: RatesPage } = await import('../rates/page')

describe('the pricing shell', () => {
  test('links Spots and Rates and marks the current one', () => {
    render(<PricingNav />)
    expect(screen.getByRole('link', { name: 'Spots' }).getAttribute('href')).toBe(
      '/admin/pricing/spots'
    )
    expect(screen.getByRole('link', { name: 'Rates' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Spots' }).getAttribute('aria-current')).toBeNull()
  })

  test('each page renders its placeholder', () => {
    render(<SpotsPage />)
    expect(screen.getByText('Spots are coming')).toBeTruthy()
    render(<RatesPage />)
    expect(screen.getByText('Rates are coming')).toBeTruthy()
  })

  test('the routes are admin only', () => {
    expect(protectedRoutes.adminPricingSpots.roles).toEqual(['admin'])
    expect(protectedRoutes.adminPricingRates.roles).toEqual(['admin'])
  })
})
