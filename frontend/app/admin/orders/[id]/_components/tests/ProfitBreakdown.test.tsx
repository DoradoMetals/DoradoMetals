import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'

import { ProfitBreakdown } from '../ProfitBreakdown'
import { profit, scrapLot } from './detailFixtures'

describe('ProfitBreakdown', () => {
  test('Basis=Estimated, Open: settled count, unsettled and settled lots in the default color, fees, profit', () => {
    const { container } = render(
      <ProfitBreakdown breakdown={profit()} lotHref={(id) => `/admin/lots/${id}`} />
    )
    expect(screen.getByText('1 of 2 settled')).toBeTruthy()
    expect(screen.getByText('Unsettled')).toBeTruthy()
    expect(screen.getByText('Settled')).toBeTruthy()
    expect(screen.getByText('$4,997.84').className).toContain('text-foreground')
    expect(screen.getByText('$4,997.84').className).not.toContain('text-subtle')
    expect(screen.getByText('$5,423.08').className).toContain('text-foreground')
    expect(screen.getByRole('link', { name: 'Lot 2481-A' }).getAttribute('href')).toBe(
      `/admin/lots/${scrapLot.lot_id}`
    )
    expect(screen.getByText('Shipping')).toBeTruthy()
    expect(screen.getByText('Payout fee')).toBeTruthy()
    expect(container.textContent).toContain('$773.91')
  })

  test('Basis=Realized, Open=False: profit and Realized in the header', () => {
    render(
      <ProfitBreakdown
        breakdown={profit({ basis: 'realized', settled_lots: 2 })}
        defaultOpen={false}
      />
    )
    expect(screen.getByText('$773.91')).toBeTruthy()
    expect(screen.getByText('Realized')).toBeTruthy()
  })

  test('Basis=Estimated, Open=False: the settled count stays in the header', () => {
    render(<ProfitBreakdown breakdown={profit()} defaultOpen={false} />)
    expect(screen.getByText('1 of 2 settled')).toBeTruthy()
  })

  test('Content=Empty, Loading and Error', () => {
    const { unmount } = render(<ProfitBreakdown breakdown={profit({ lots: [] })} />)
    expect(screen.getByText('No profit yet')).toBeTruthy()
    unmount()
    const second = render(<ProfitBreakdown breakdown={undefined} content="loading" />)
    expect(screen.getByRole('status', { name: 'Loading profit breakdown' })).toBeTruthy()
    second.unmount()
    render(<ProfitBreakdown breakdown={undefined} content="error" onRetry={() => {}} />)
    expect(screen.getByText('Couldn’t load profit')).toBeTruthy()
  })
})
