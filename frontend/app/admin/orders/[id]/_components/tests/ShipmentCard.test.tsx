import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'

import { ShipmentCard } from '../ShipmentCard'
import { button, shipment } from './cardFixtures'

describe('Shipment (179:2460) and Return Shipment (296:5324)', () => {
  it('Label Created: facts, Print Label, Cancel Shipment', () => {
    const onCancelLabel = vi.fn()
    const onPrintLabel = vi.fn()
    const { container } = render(
      <ShipmentCard
        shipment={shipment({})}
        shipsFrom="Austin, TX"
        onCancelLabel={onCancelLabel}
        onPrintLabel={onPrintLabel}
      />
    )
    expect(screen.getByText('Label Created')).toBeTruthy()
    expect(screen.getByText('794812345678')).toBeTruthy()
    expect(screen.getByText('FedEx Ground')).toBeTruthy()
    expect(screen.getByText('Austin, TX')).toBeTruthy()
    fireEvent.click(button(container, 'Cancel Shipment')!)
    fireEvent.click(button(container, 'Print Label')!)
    expect(onCancelLabel).toHaveBeenCalled()
    expect(onPrintLabel).toHaveBeenCalled()
  })

  it('sale parcel shows signature required (ruling 149)', () => {
    render(<ShipmentCard shipment={shipment({})} signature />)
    expect(screen.getByText('Signature required')).toBeTruthy()
  })

  it('cancel is hidden when the shipment does not offer it', () => {
    const { container } = render(
      <ShipmentCard shipment={shipment({ cancel_label: false })} onCancelLabel={() => {}} />
    )
    expect(button(container, 'Cancel Shipment')).toBeUndefined()
  })

  it('In Transit: tracker with ETA', () => {
    render(<ShipmentCard shipment={shipment({ tracking_status: 'In Transit', reached: 3 })} />)
    expect(screen.getAllByText('In Transit').length).toBeGreaterThan(1)
    expect(screen.getByText('ETA')).toBeTruthy()
    expect(screen.getByText('Out for Delivery')).toBeTruthy()
  })

  it('Delivered: tracker shows Delivered', () => {
    render(
      <ShipmentCard
        shipment={shipment({
          tracking_status: 'Delivered',
          reached: 5,
          delivered_at: '2026-09-03T19:41:00Z',
        })}
      />
    )
    expect(screen.getAllByText('Delivered').length).toBeGreaterThan(1)
  })

  it('Awaiting Tracking: carrier, tracking input and Save Tracking', () => {
    const onSaveTracking = vi.fn()
    const { container } = render(
      <ShipmentCard
        shipment={shipment({ tracking_number: null, edit_tracking: true })}
        shipsFrom="Elemetal Refining · Dallas, TX"
        shipsTo="Austin, TX"
        carriers={[{ value: 'c1', label: 'FedEx' }]}
        onSaveTracking={onSaveTracking}
      />
    )
    expect(screen.getByText('Awaiting Tracking')).toBeTruthy()
    expect(button(container, 'Save Tracking')!.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Tracking #'), { target: { value: ' 123 ' } })
    fireEvent.click(button(container, 'Save Tracking')!)
    expect(onSaveTracking).toHaveBeenCalledWith({
      carrier_id: expect.any(String),
      tracking_number: '123',
    })
  })

  it('Return Shipment: title, Cancel Return, Returned', () => {
    const { container, rerender } = render(
      <ShipmentCard
        kind="return"
        shipment={shipment({})}
        shipsTo="Austin, TX"
        onCancelLabel={() => {}}
      />
    )
    expect(screen.getByText('Return Shipment')).toBeTruthy()
    expect(button(container, 'Cancel Return')).toBeTruthy()
    rerender(
      <ShipmentCard
        kind="return"
        shipment={shipment({
          tracking_status: 'Delivered',
          reached: 5,
          delivered_at: '2026-09-03T19:41:00Z',
        })}
      />
    )
    expect(screen.getAllByText('Returned').length).toBeGreaterThan(0)
  })

  it('mobile renders', () => {
    render(<ShipmentCard layout="mobile" shipment={shipment({})} />)
    expect(screen.getByText('Label Created')).toBeTruthy()
  })
})
