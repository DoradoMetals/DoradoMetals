import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { OrderSection } from '../OrderSection'
import { button } from './cardFixtures'

describe('OrderSection', () => {
  it('loaded draws children and the badge; closing hides the body and keeps the closed badge', () => {
    const onOpenChange = vi.fn()
    const { container, rerender } = render(
      <OrderSection
        title="Payment"
        badge={<span>Open badge</span>}
        closedBadge={<span>Closed badge</span>}
        onOpenChange={onOpenChange}
      >
        <p>body</p>
      </OrderSection>
    )
    expect(screen.getByText('body')).toBeTruthy()
    expect(screen.getByText('Open badge')).toBeTruthy()
    fireEvent.click(button(container, 'Payment') ?? screen.getByText('Payment'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    rerender(
      <OrderSection
        title="Payment"
        open={false}
        badge={<span>Open badge</span>}
        closedBadge={<span>Closed badge</span>}
      >
        <p>body</p>
      </OrderSection>
    )
    expect(screen.getByText('Closed badge')).toBeTruthy()
    expect(screen.queryByText('Open badge')).toBeNull()
  })

  it('loading, empty and error replace the children', () => {
    const onRetry = vi.fn()
    const { container, rerender } = render(
      <OrderSection title="Notes" content="loading">
        <p>body</p>
      </OrderSection>
    )
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe('Loading notes')
    expect(screen.queryByText('body')).toBeNull()
    rerender(
      <OrderSection title="Notes" content="empty" emptyTitle="Nothing" emptyDescription="Here">
        <p>body</p>
      </OrderSection>
    )
    expect(screen.getByText('Nothing')).toBeTruthy()
    rerender(
      <OrderSection title="Notes" content="error" onRetry={onRetry}>
        <p>body</p>
      </OrderSection>
    )
    expect(screen.getByText('Couldn’t load notes')).toBeTruthy()
    fireEvent.click(button(container, 'Try again')!)
    expect(onRetry).toHaveBeenCalled()
  })

  it('a custom error title wins', () => {
    render(<OrderSection title="Notes" content="error" errorTitle="Broken" />)
    expect(screen.getByText('Broken')).toBeTruthy()
  })
})
