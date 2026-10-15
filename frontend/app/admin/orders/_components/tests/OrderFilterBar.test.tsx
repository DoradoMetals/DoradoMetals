import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import {
  OrderFilterBar,
  OrderPartyFilter,
  purchaseStateFilters,
  saleStateFilters,
} from '../OrderFilterBar'
import { AdminHeader, Select, Button } from '@dorado/components'

describe('OrderFilterBar', () => {
  it('Purchases row (715:38920): All, five states, Cancelled last; All selected', async () => {
    const { container, getAllByRole } = render(
      <OrderFilterBar chips={purchaseStateFilters} value="all" onValueChange={() => {}} />
    )
    const labels = getAllByRole('radio').map((r) => r.textContent)
    expect(labels).toEqual([
      'All',
      'Awaiting Receipt',
      'Awaiting Finalize',
      'At Refiner',
      'Ready to Pay',
      'Completed',
      'Cancelled',
    ])
    expect(getAllByRole('radio')[0].getAttribute('aria-checked')).toBe('true')
    expect(container.querySelector('svg')).toBeNull()
  })

  it('Sales row (715:38954) carries the sale states with Cancelled last', () => {
    const { getAllByRole } = render(
      <OrderFilterBar chips={saleStateFilters} value="Preparing" onValueChange={() => {}} />
    )
    expect(getAllByRole('radio').map((r) => r.textContent)).toEqual([
      'All',
      'Awaiting Payment',
      'Preparing',
      'In Transit',
      'Completed',
      'Cancelled',
    ])
    expect(getAllByRole('radio')[2].getAttribute('aria-checked')).toBe('true')
  })

  it('a chip click reports its value', () => {
    const onValueChange = vi.fn()
    const { getByRole } = render(
      <OrderFilterBar chips={purchaseStateFilters} value="all" onValueChange={onValueChange} />
    )
    fireEvent.click(getByRole('radio', { name: 'Cancelled' }))
    expect(onValueChange).toHaveBeenCalledWith('Cancelled')
  })

  it('the selected chip wears the emphasis border, no radio icon (ruling 122)', () => {
    const { getByRole } = render(
      <OrderFilterBar chips={purchaseStateFilters} value="all" onValueChange={() => {}} />
    )
    expect(getByRole('radio', { name: 'All' }).className).toContain('border-primary')
  })

  it('the toolbar (626:11861) rides the existing AdminHeader slots', async () => {
    const { container, getByText, getByRole } = render(
      <AdminHeader
        title="Orders & Lots"
        radioLabel="Showing"
        radio={
          <OrderPartyFilter
            items={[
              { value: 'customers', label: 'Customers' },
              { value: 'refiners', label: 'Refiners' },
            ]}
            value="customers"
            onValueChange={() => {}}
          />
        }
        selects={
          <>
            <Select label="Show" items={[{ value: 'unassigned', label: 'Unassigned' }]} />
            <Select label="Sort by" items={[{ value: 'newest', label: 'Newest first' }]} />
          </>
        }
        reset={
          <Button variant="tertiary" size="sm">
            Reset
          </Button>
        }
        count="6 orders · 18 unassigned lots"
      />
    )
    expect(getByText('Showing')).toBeTruthy()
    expect(getByRole('radio', { name: 'Customers' }).getAttribute('aria-checked')).toBe('true')
    expect(getByText('6 orders · 18 unassigned lots')).toBeTruthy()
  })
})
