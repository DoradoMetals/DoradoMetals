import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'
import type { RefiningLinkedOrder } from '@dorado/contracts'

import { LinkedFulfillment } from '../LinkedFulfillment'

const orders: RefiningLinkedOrder[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    number: 1112,
    direction: 'sale',
    reference: 'SO-1112',
    customer_name: 'Marguerite Whitfield',
    city: 'Austin, TX',
    stage: 'Label Created',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    number: 1118,
    direction: 'sale',
    reference: 'SO-1118',
    customer_name: 'Harlan Boyd',
    city: 'Plano, TX',
    stage: 'In Transit',
  },
]

describe('LinkedFulfillment (728:45748)', () => {
  it('Desktop, Loaded (728:45664): header, badge, ships from, one row per sales order, the note', () => {
    const { container } = render(
      <LinkedFulfillment
        orders={orders}
        method="Drop ship"
        shipsFrom="Elemetal Refining · Dallas, TX"
      />
    )
    expect(screen.getByRole('button', { name: /Fulfillment/ })).toBeTruthy()
    expect(screen.getByText('Drop ship')).toBeTruthy()
    expect(screen.getByText('Ships from')).toBeTruthy()
    expect(screen.getByText('Elemetal Refining · Dallas, TX')).toBeTruthy()
    expect(screen.getByText('Sales orders')).toBeTruthy()
    const first = screen.getByRole('link', { name: 'SO-1112' })
    expect(first.getAttribute('href')).toBe(`/admin/orders/${orders[0].id}`)
    expect(screen.getByRole('link', { name: 'SO-1118' }).getAttribute('href')).toBe(
      `/admin/orders/${orders[1].id}`
    )
    expect(screen.getByText('Marguerite Whitfield · Austin, TX')).toBeTruthy()
    expect(screen.getByText('Label Created')).toBeTruthy()
    expect(screen.getByText('In Transit')).toBeTruthy()
    expect(
      screen.getByText(
        'Ships from the refiner to each customer. Tracking lives on each sales order.'
      )
    ).toBeTruthy()
    expect(container.querySelector('[data-layout="desktop"] li .flex-row')).toBeTruthy()
  })

  it('Mobile, Loaded (728:45705) stacks each row', () => {
    const { container } = render(<LinkedFulfillment orders={orders} layout="mobile" />)
    const rows = container.querySelectorAll('[data-layout="mobile"] li .flex-col')
    expect(rows.length).toBe(2)
  })

  it('leaves out the ships-from block and the badge when the read has none', () => {
    render(<LinkedFulfillment orders={orders} />)
    expect(screen.queryByText('Ships from')).toBeNull()
    expect(screen.queryByText('Drop ship')).toBeNull()
  })

  it.each(['desktop', 'mobile'] as const)('Empty (%s): no rows reads the empty state', (layout) => {
    render(<LinkedFulfillment orders={[]} layout={layout} />)
    expect(screen.getByText('No linked orders')).toBeTruthy()
    expect(screen.getByText('Customer orders that ship through this one show here.')).toBeTruthy()
    expect(screen.queryByText('Sales orders')).toBeNull()
  })

  it.each(['desktop', 'mobile'] as const)('Loading (%s): three skeleton lines', (layout) => {
    const { container } = render(
      <LinkedFulfillment orders={[]} content="loading" layout={layout} />
    )
    expect(screen.getByRole('status', { name: 'Loading fulfillment' })).toBeTruthy()
    expect(container.querySelectorAll('.bg-secondary').length).toBe(3)
  })

  it.each(['desktop', 'mobile'] as const)('Error (%s): alert and Try again', (layout) => {
    const onRetry = vi.fn()
    render(<LinkedFulfillment orders={[]} content="error" layout={layout} onRetry={onRetry} />)
    expect(screen.getByText('Couldn’t load linked orders')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })
})
