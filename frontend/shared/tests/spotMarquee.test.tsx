import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

vi.mock('@dorado/components', async (original) => ({
  ...(await original<typeof import('@dorado/components')>()),
  useMediaUp: () => desktop.value,
}))

const desktop = { value: false }

vi.mock('@dorado/client', () => ({
  useSpotTicker: () => ({
    data: [
      {
        metal_id: 'Gold',
        price: 2411.2,
        ask: 2412.8,
        percent_change: 0.8,
        direction: 'up',
        at: null,
      },
      {
        metal_id: 'Silver',
        price: 29.14,
        ask: 29.2,
        percent_change: -0.3,
        direction: 'down',
        at: null,
      },
      {
        metal_id: 'Platinum',
        price: 1022.75,
        ask: 1025,
        percent_change: 1.2,
        direction: 'up',
        at: null,
      },
      {
        metal_id: 'Palladium',
        price: null,
        ask: null,
        percent_change: 0.4,
        direction: 'up',
        at: null,
      },
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
    expect(within(bar).getAllByText('$2,412.80').length).toBeGreaterThan(0)
    expect(within(bar).getAllByText('+0.8%').length).toBeGreaterThan(0)
    expect(within(bar).getAllByText('-0.3%').length).toBeGreaterThan(0)
  })

  test('a stale metal shows a dash and no change', () => {
    render(<SpotMarquee />)
    const bar = screen.getByRole('region', { name: 'Live spot prices' })
    expect(within(bar).getAllByText('—').length).toBeGreaterThan(0)
    expect(within(bar).queryByText('+0.4%')).toBeNull()
  })

  test('on desktop the button switches ask and bid and is remembered per viewer', () => {
    desktop.value = true
    window.localStorage.removeItem('dorado.spots.bid-ask')
    const { unmount } = render(<SpotMarquee />)
    expect(screen.getByText('$2,412.80')).toBeTruthy()
    expect(screen.queryByText('$2,411.20')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show bid' }))
    expect(screen.getByText('$2,411.20')).toBeTruthy()
    expect(screen.queryByText('$2,412.80')).toBeNull()
    expect(screen.queryByText('Bid')).toBeNull()
    expect(screen.queryByText('Ask')).toBeNull()
    expect(screen.getByRole('button', { name: 'Show ask' })).toBeTruthy()
    expect(window.localStorage.getItem('dorado.spots.bid-ask')).toBe('on')
    unmount()
    render(<SpotMarquee />)
    expect(screen.getByText('$2,411.20')).toBeTruthy()
    desktop.value = false
  })

  test('on mobile there is no toggle', () => {
    desktop.value = false
    render(<SpotMarquee />)
    expect(screen.queryByRole('button', { name: /Show (bid|ask)/ })).toBeNull()
  })
})
