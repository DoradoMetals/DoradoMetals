import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'

import {
  CreateFulfillment,
  purchaseCreateMethods,
  saleCreateMethods,
  type CreateMethod,
} from '../CreateFulfillment'
import { button } from './cardFixtures'

function draw(
  method: CreateMethod,
  layout: 'desktop' | 'mobile' = 'desktop',
  methods = purchaseCreateMethods
) {
  const onSubmit = vi.fn()
  const utils = render(
    <CreateFulfillment
      layout={layout}
      methods={methods}
      method={method}
      options={{ returnCharge: '$18.40' }}
      draft={{}}
      onDraftChange={() => {}}
      onSubmit={onSubmit}
    />
  )
  return { ...utils, onSubmit }
}

describe('Create Fulfillment (237:4619)', () => {
  it('a sale offers Shipment and Appointment only', () => {
    expect(saleCreateMethods).toEqual(['shipment', 'appointment'])
    draw('shipment', 'desktop', saleCreateMethods)
    expect(screen.getByRole('tab', { name: 'Shipment' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Appointment' })).toBeTruthy()
    expect(screen.queryByRole('tab', { name: 'Pickup' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Drop-off' })).toBeNull()
  })

  it('Shipment: parcel fields and Create Shipment', () => {
    const { container, onSubmit } = draw('shipment')
    for (const label of [
      'Service',
      'Package size',
      'Handoff',
      'Ship to',
      'Ship from',
      'Declared value',
      'Coverage',
    ])
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    fireEvent.click(button(container, 'Create Shipment')!)
    expect(onSubmit).toHaveBeenCalledWith('shipment')
  })

  it('Pickup: driver and pickup address', () => {
    draw('pickup')
    expect(screen.getAllByText('Driver').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Pickup address').length).toBeGreaterThan(0)
    expect(screen.getByText('Create Pickup')).toBeTruthy()
  })

  it('Appointment: office and with', () => {
    draw('appointment')
    expect(screen.getAllByText('Office').length).toBeGreaterThan(0)
    expect(screen.getAllByText('With').length).toBeGreaterThan(0)
    expect(screen.getByText('Create Appointment')).toBeTruthy()
  })

  it('Return Shipment: bill switch and charge', () => {
    draw('return', 'desktop', [...purchaseCreateMethods, 'return'])
    expect(screen.getByLabelText('Bill return shipping to the customer')).toBeTruthy()
    expect(screen.getByText('$18.40')).toBeTruthy()
    expect(screen.getByText('Create Return')).toBeTruthy()
  })

  it('Drop-off: driver and refinery', () => {
    draw('dropoff')
    expect(screen.getAllByText('Refinery').length).toBeGreaterThan(0)
    expect(screen.getByText('Create Drop-off')).toBeTruthy()
  })

  it('mobile renders and pending disables submit', () => {
    const { container } = render(
      <CreateFulfillment
        layout="mobile"
        methods={['appointment']}
        method="appointment"
        options={{}}
        draft={{}}
        onDraftChange={() => {}}
        onSubmit={() => {}}
        pending
      />
    )
    expect(button(container, 'Create Appointment')!.disabled).toBe(true)
  })
})
