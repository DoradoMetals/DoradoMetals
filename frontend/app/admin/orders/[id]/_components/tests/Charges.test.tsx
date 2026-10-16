import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { Charges } from '../Charges'
import { action, purchasePricing } from './detailFixtures'

describe('Charges', () => {
  test('Open, Loaded: payout and shipping charges, read-only without edit_charges', () => {
    render(<Charges direction="purchase" pricing={purchasePricing} actions={[]} />)
    const payout = screen.getByLabelText('Payout Charge') as HTMLInputElement
    expect(payout.value).toBe('12.50')
    expect(payout.readOnly).toBe(true)
    expect((screen.getByLabelText('Shipping Charge') as HTMLInputElement).value).toBe('24.00')
    expect(screen.queryByLabelText('Payment Charge')).toBeNull()
  })

  test('edits commit when edit_charges is offered', () => {
    const onShippingChargeChange = vi.fn()
    render(
      <Charges
        direction="purchase"
        pricing={purchasePricing}
        actions={[action('edit_charges')]}
        onShippingChargeChange={onShippingChargeChange}
      />
    )
    const shipping = screen.getByLabelText('Shipping Charge')
    fireEvent.change(shipping, { target: { value: '30' } })
    fireEvent.blur(shipping)
    expect(onShippingChargeChange).toHaveBeenCalledWith(30)
  })

  test('a sale has no payout charge; mobile stacks the inputs', () => {
    const { container } = render(
      <Charges direction="sale" pricing={purchasePricing} actions={[]} layout="mobile" />
    )
    expect(screen.queryByLabelText('Payout Charge')).toBeNull()
    const card = screen.getByLabelText('Payment Charge') as HTMLInputElement
    expect(card.value).toBe('0.00')
    expect(card.readOnly).toBe(true)
    expect(container.querySelector('.flex-col')).toBeTruthy()
  })

  test('Open=False shows only the title', () => {
    render(
      <Charges direction="purchase" pricing={purchasePricing} actions={[]} defaultOpen={false} />
    )
    expect(screen.getByText('Charges')).toBeTruthy()
    expect(screen.queryByLabelText('Payout Charge')).toBeNull()
  })

  test('Content=Empty, Loading and Error', () => {
    const { unmount } = render(<Charges direction="purchase" pricing={null} actions={[]} />)
    expect(screen.getByText('No charges')).toBeTruthy()
    unmount()
    const second = render(
      <Charges direction="purchase" pricing={null} actions={[]} content="loading" />
    )
    expect(screen.getByRole('status', { name: 'Loading charges' })).toBeTruthy()
    second.unmount()
    render(
      <Charges
        direction="purchase"
        pricing={null}
        actions={[]}
        content="error"
        onRetry={() => {}}
      />
    )
    expect(screen.getByText('Couldn’t load charges')).toBeTruthy()
  })
})
