import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { Refunds, refundMethod } from '../Refunds'
import { button } from './cardFixtures'
import { names } from './detailFixtures'
import { refund, refunds } from './moneyFixtures'

describe('Refunds (1207:15332)', () => {
  it('Layout=Desktop: When, Amount, Method, Who per refund; no state column', () => {
    render(<Refunds refunds={refunds} names={names} />)
    for (const header of ['When', 'Amount', 'Method', 'Who'])
      expect(screen.getAllByText(header).length).toBeGreaterThan(0)
    expect(screen.queryByText('Succeeded')).toBeNull()
    expect(screen.getByText('$1,105.20')).toBeTruthy()
    expect(screen.getByText('Card · Visa •••• 4242')).toBeTruthy()
    expect(screen.getByText('Dana Whitlock')).toBeTruthy()
    expect(screen.getByText('$250.00')).toBeTruthy()
    expect(screen.getByText('ACH')).toBeTruthy()
  })

  it('Layout=Mobile draws cards with the same values', () => {
    const { container } = render(<Refunds refunds={refunds} names={names} layout="mobile" />)
    expect(container.querySelector('[data-layout="mobile"]')).toBeTruthy()
    expect(screen.getByText('$1,105.20')).toBeTruthy()
    expect(screen.getByText('Card · Visa •••• 4242')).toBeTruthy()
  })

  it('no refunds draws the empty state', () => {
    render(<Refunds refunds={[]} names={names} />)
    expect(screen.getByText('No refunds')).toBeTruthy()
  })

  it('loading and error, with retry', () => {
    const onRetry = vi.fn()
    const { rerender, container } = render(
      <Refunds refunds={refunds} names={names} content="loading" />
    )
    expect(screen.getByRole('status')).toBeTruthy()
    rerender(<Refunds refunds={refunds} names={names} content="error" onRetry={onRetry} />)
    fireEvent.click(button(container, 'Try again')!)
    expect(onRetry).toHaveBeenCalled()
  })

  it('refundMethod names card, bare card, and other rails', () => {
    expect(refundMethod(refund())).toBe('Card · Visa •••• 4242')
    expect(refundMethod(refund({ card_brand: null, card_last4: null }))).toBe('Card')
    expect(refundMethod(refund({ rail: 'WIRE', card_brand: null, card_last4: null }))).toBe('WIRE')
  })
})
