import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'

import { LinkedFulfillment, type LinkedSale } from '../LinkedFulfillment'
import { U1, U2 } from './cardFixtures'

const orders: LinkedSale[] = [
  {
    id: U1,
    number: 1112,
    direction: 'sale',
    reference: 'SO-1112',
    customer_name: 'Marguerite Whitfield',
    city: 'Austin, TX',
    stage: 'Label Created',
  },
  {
    id: U2,
    number: 1113,
    direction: 'sale',
    reference: 'SO-1113',
    customer_name: 'Tomas Bell',
    city: 'Waco, TX',
    stage: 'In Transit',
  },
] as LinkedSale[]

describe('Linked Fulfillment (371:8332, proposed 728:45748)', () => {
  it('Loaded: Drop ship badge, ships from, one row per sale, opening a row', () => {
    const onOpenOrder = vi.fn()
    render(
      <LinkedFulfillment
        orders={orders}
        shipsFrom="Elemetal Refining · Dallas, TX"
        onOpenOrder={onOpenOrder}
      />
    )
    expect(screen.getByText('Drop ship')).toBeTruthy()
    expect(screen.getByText('Elemetal Refining · Dallas, TX')).toBeTruthy()
    expect(screen.getByText('SO-1112')).toBeTruthy()
    expect(screen.getByText('Marguerite Whitfield · Austin, TX')).toBeTruthy()
    expect(screen.getByText('In Transit')).toBeTruthy()
    fireEvent.click(screen.getByText('SO-1113'))
    expect(onOpenOrder).toHaveBeenCalledWith(U2)
  })

  it('Empty, Loading and Error', () => {
    const { rerender } = render(<LinkedFulfillment orders={[]} />)
    expect(screen.getByText('No linked orders')).toBeTruthy()
    rerender(<LinkedFulfillment orders={orders} content="loading" />)
    expect(screen.getByRole('status')).toBeTruthy()
    rerender(<LinkedFulfillment orders={orders} content="error" />)
    expect(screen.getByText('Couldn’t load linked orders')).toBeTruthy()
  })

  it('mobile renders', () => {
    render(<LinkedFulfillment layout="mobile" orders={orders} />)
    expect(screen.getByText('SO-1112')).toBeTruthy()
  })
})
