import { describe, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

vi.mock('@dorado/client', () => ({
  useSpotTicker: () => ({
    data: [
      { metal_id: 'Gold', price: 2411.2, percent_change: 0.8, direction: 'up', at: null },
      { metal_id: 'Silver', price: 29.14, percent_change: -0.3, direction: 'down', at: null },
      { metal_id: 'Platinum', price: 1022.75, percent_change: 1.2, direction: 'up', at: null },
      { metal_id: 'Palladium', price: null, percent_change: 0.4, direction: 'up', at: null },
    ],
  }),
}))

const { SpotMarquee } = await import('@/shared/ui/SpotMarquee')

describe('the live spots bar', () => {
  test('renders one cell per metal: label, price and one-decimal change', () => {
    render(<SpotMarquee />)
    const bar = screen.getByRole('region', { name: 'Live spot prices' })
    for (const metal of ['Gold', 'Silver', 'Platinum', 'Palladium']) {
      expect(within(bar).getAllByText(metal).length).toBeGreaterThan(0)
    }
    expect(within(bar).getAllByText('$2,411.20').length).toBeGreaterThan(0)
    expect(within(bar).getAllByText('+0.8%').length).toBeGreaterThan(0)
    expect(within(bar).getAllByText('-0.3%').length).toBeGreaterThan(0)
  })

  test('a stale metal shows a dash and no change', () => {
    render(<SpotMarquee />)
    const bar = screen.getByRole('region', { name: 'Live spot prices' })
    expect(within(bar).getAllByText('—').length).toBeGreaterThan(0)
    expect(within(bar).queryByText('+0.4%')).toBeNull()
  })
})
