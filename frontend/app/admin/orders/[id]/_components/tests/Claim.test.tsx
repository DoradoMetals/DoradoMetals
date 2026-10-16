import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import * as React from 'react'

import { Claim } from '../Claim'
import { claim } from './cardFixtures'

const ship = { trackingNumber: '7731 2290 0144', carrier: 'FedEx' }

describe('Claim (1208:15959)', () => {
  it.each(['Pending', 'Paid', 'Denied'] as const)(
    '%s: badge, filed, carrier claim, shipment, amount, note',
    (status) => {
      render(<Claim claim={claim({ status })} {...ship} />)
      expect(screen.getByText(status)).toBeTruthy()
      expect(screen.getByText('FedEx 7731-2290')).toBeTruthy()
      expect(screen.getByText('FedEx 7731 2290 0144')).toBeTruthy()
      expect(screen.getByText('$4,701.84')).toBeTruthy()
      expect(screen.getByText(/parcel scanned delivered/)).toBeTruthy()
    }
  )

  it('Paid shows the paid amount', () => {
    render(<Claim claim={claim({ status: 'Paid', paid_amount: 4000 })} {...ship} />)
    expect(screen.getByText('$4,000.00')).toBeTruthy()
  })

  it('mobile lays out and missing numbers show a dash', () => {
    const { container } = render(
      <Claim layout="mobile" claim={claim({ carrier_claim_number: null })} />
    )
    expect(container.querySelector('[data-layout="mobile"]')).toBeTruthy()
    expect(screen.getAllByText('—').length).toBe(2)
  })

  it('no claim draws the empty state; loading and error draw their states', () => {
    const { rerender } = render(<Claim claim={null} />)
    expect(screen.getByText('No claim')).toBeTruthy()
    rerender(<Claim claim={null} content="loading" />)
    expect(screen.getByRole('status')).toBeTruthy()
    rerender(<Claim claim={null} content="error" />)
    expect(screen.getByText('Check your connection, then try again.')).toBeTruthy()
  })
})
