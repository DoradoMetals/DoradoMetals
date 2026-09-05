import { describe, expect, test, vi, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { renderWithClient } from '@/shared/tests/renderWithClient'
import React from 'react'

const wireSpots = () => [
  {
    id: 'Gold',
    ask: 3400.1,
    bid: 3390.5,
    dollar_change: 12.34,
    percent_change: 0.36,
    direction: 'up',
  },
  {
    id: 'Silver',
    ask: 41.2,
    bid: 40.9,
    dollar_change: -0.56,
    percent_change: -1.34,
    direction: 'down',
  },
  {
    id: 'Platinum',
    ask: 1310.7,
    bid: 1298.2,
    dollar_change: 4.05,
    percent_change: 0.31,
    direction: 'up',
  },
  {
    id: 'Palladium',
    ask: 955.3,
    bid: 941.8,
    dollar_change: -8.6,
    percent_change: -0.9,
    direction: 'down',
  },
]

vi.mock('@dorado/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSpotPrices: () => ({ data: wireSpots(), isSuccess: true }),
}))
vi.mock('@/shared/hooks/auth/queries', () => ({
  useGetSession: () => ({ user: null }),
}))
vi.mock('@dorado/components', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    Amount: ({ value, className }: { value: number; className?: string }) =>
      React.createElement('span', { className }, String(value)),
  }
})

import { useSpotTypeStore } from '@/shared/store/spotStore'
import Spots from '@/shared/ui/Spots'

beforeEach(() => {
  useSpotTypeStore.setState({ type: 'Ask' })
})

function marqueeBlocks(container: HTMLElement) {
  const hidden = container.querySelector('[aria-hidden="true"]') as HTMLElement
  const visible = hidden.previousElementSibling as HTMLElement
  return { visible, hidden }
}

describe('the spot marquee', () => {
  test("renders every metal's name and price once in the visible copy", async () => {
    const { container } = renderWithClient(<Spots />)
    await waitFor(() => expect(screen.getAllByText('Gold').length).toBeGreaterThan(0))

    const { visible } = marqueeBlocks(container)
    for (const metal of ['Gold', 'Silver', 'Platinum', 'Palladium']) {
      expect(within(visible).getAllByText(metal)).toHaveLength(1)
    }
    expect(within(visible).getAllByText('3400.1')).toHaveLength(1)
  })

  test('duplicates the seam copy and marks it aria-hidden', async () => {
    const { container } = renderWithClient(<Spots />)
    await waitFor(() => expect(screen.getAllByText('Gold')).toHaveLength(2))

    const { visible, hidden } = marqueeBlocks(container)
    expect(visible.hasAttribute('aria-hidden')).toBe(false)
    expect(hidden.getAttribute('aria-hidden')).toBe('true')
    expect(within(hidden).getAllByText('Gold')).toHaveLength(1)
    expect(within(hidden).getAllByText('3400.1')).toHaveLength(1)
  })

  test('shows the ask by default and the bid once the store switches', async () => {
    renderWithClient(<Spots />)
    await waitFor(() => expect(screen.getAllByText('3400.1').length).toBeGreaterThan(0))
    expect(screen.queryByText('3390.5')).toBeNull()

    useSpotTypeStore.setState({ type: 'Bid' })
    renderWithClient(<Spots />)
    await waitFor(() => expect(screen.getAllByText('3390.5').length).toBeGreaterThan(0))
  })

  test('a falling price is destructive and a rising one is success', async () => {
    renderWithClient(<Spots />)
    await waitFor(() => expect(screen.getAllByText('12.34').length).toBeGreaterThan(0))
    for (const el of screen.getAllByText('12.34')) {
      expect(el.parentElement?.className).toContain('text-success')
    }
    for (const el of screen.getAllByText('-0.56')) {
      expect(el.parentElement?.className).toContain('text-destructive')
    }
  })
})
