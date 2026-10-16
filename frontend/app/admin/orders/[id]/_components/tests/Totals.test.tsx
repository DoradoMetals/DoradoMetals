import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'

import { Totals } from '../Totals'
import { purchasePricing, salePricing } from './detailFixtures'

describe('Totals', () => {
  test('purchase, Credit=None: scrap, bullion, the two deductions in red, total payout', () => {
    const { container } = render(<Totals direction="purchase" pricing={purchasePricing} />)
    expect(screen.getByText('$8,412.66')).toBeTruthy()
    expect(screen.getByText('$4,969.93')).toBeTruthy()
    expect(screen.getByText('$24.00').className).toContain('text-destructive')
    expect(screen.getByText('$12.50').className).toContain('text-destructive')
    expect(screen.getByText('Total payout')).toBeTruthy()
    expect(container.textContent).toContain('$13,346.09')
  })

  test('sale, Credit=Applied: items, shipping, tax, the credit as a deduction, total due', () => {
    render(<Totals direction="sale" pricing={salePricing} />)
    expect(screen.getByText('$17,850.00')).toBeTruthy()
    expect(screen.getByText('$1,100.05')).toBeTruthy()
    expect(screen.getByText('−$300.00').className).toContain('text-destructive')
    expect(screen.getByText('Total due')).toBeTruthy()
  })

  test('sale, Credit=Released: the released credit reads as a plain line', () => {
    render(
      <Totals
        direction="sale"
        pricing={{ ...salePricing, credit_applied: 0, credit_released: 300, total: 18974.05 }}
      />
    )
    expect(screen.queryByText('Credit applied')).toBeNull()
    expect(screen.getByText('Credit released to balance')).toBeTruthy()
    expect(screen.getByText('$300.00').className).not.toContain('text-destructive')
  })

  test('Open=False carries the total; mobile renders the same lines', () => {
    const { unmount } = render(
      <Totals direction="purchase" pricing={purchasePricing} defaultOpen={false} />
    )
    expect(screen.getByText('$13,346.09')).toBeTruthy()
    unmount()
    render(<Totals direction="purchase" pricing={purchasePricing} layout="mobile" />)
    expect(screen.getByText('Payout fee')).toBeTruthy()
  })

  test('Content=Empty, Loading and Error', () => {
    const { unmount } = render(<Totals direction="purchase" pricing={null} />)
    expect(screen.getByText('Not priced yet')).toBeTruthy()
    unmount()
    const second = render(<Totals direction="purchase" pricing={undefined} content="loading" />)
    expect(screen.getByRole('status', { name: 'Loading totals' })).toBeTruthy()
    second.unmount()
    render(<Totals direction="purchase" pricing={undefined} content="error" onRetry={() => {}} />)
    expect(screen.getByText('Couldn’t load totals')).toBeTruthy()
  })
})
