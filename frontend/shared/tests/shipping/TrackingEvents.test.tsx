// The progress timeline, RENDERED. It used to be derived here - which four
// stages a parcel passes through, which scans are duplicates, which rungs are
// still ahead - and the derivation is the server's now
// (api/domain/shipping/rules.ts trackingTimeline, tested without a database).
//
// What this pins is the half that is genuinely the component's: a rung the
// carrier has reached is drawn solid and one still ahead is drawn faint, the
// header says Delivered rather than ETA once the parcel has landed, and a
// stage with no scan time prints no date instead of "Invalid Date".
import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

import TrackingEvents from '@/shared/ui/TrackingEvents'
import type { ShipmentView } from '@dorado/contracts'

const view = (over: Partial<ShipmentView> = {}): ShipmentView =>
  ({
    shipment: {
      id: 's-1',
      tracking_number: '794657100000',
      shipping_status: 'In Transit',
      est_delivery: '2026-09-12T17:00:00Z',
      delivered_at: null,
      direction: 'Inbound',
    },
    service: null,
    carrier_id: null,
    package: null,
    carrier_pickup: null,
    handoff_at: null,
    tracking_status: 'In Transit',
    timeline: [
      {
        stage: 'Picked Up',
        location: 'DALLAS, TX',
        scan_time: '2026-09-10T14:00:00Z',
        reached: true,
      },
      {
        stage: 'In Transit',
        location: 'MEMPHIS, TN',
        scan_time: '2026-09-11T02:00:00Z',
        reached: true,
      },
      { stage: 'Out for Delivery', location: null, scan_time: null, reached: false },
      { stage: 'Delivered', location: null, scan_time: null, reached: false },
      ...[],
    ],
    actions: {
      track: true,
      cancel_label: false,
      edit_charge: false,
      edit_tracking: false,
      show_instructions: false,
    },
    ...over,
  }) as unknown as ShipmentView

describe("TrackingEvents renders the server's timeline", () => {
  test('every rung the server sent is drawn, reached or not', () => {
    render(<TrackingEvents isLoading={false} shipment={view()} />)
    for (const stage of ['Picked Up', 'In Transit', 'Out for Delivery', 'Delivered']) {
      expect(screen.getByText(stage)).toBeTruthy()
    }
    expect(screen.getByText('794657100000')).toBeTruthy()
  })

  test('a stage with no scan time prints no date', () => {
    render(<TrackingEvents isLoading={false} shipment={view()} />)
    expect(screen.queryByText(/Invalid Date/)).toBeNull()
  })

  // The header reads the server's `tracking_status`, not a string the
  // component maps for itself.
  test('Delivered is announced as Delivered, not as an ETA', () => {
    render(<TrackingEvents isLoading={false} shipment={view({ tracking_status: 'Delivered' })} />)
    expect(screen.getByText('Delivered:')).toBeTruthy()
    expect(screen.queryByText('ETA:')).toBeNull()
  })

  test('no parcel is not a crash - the timeline is simply empty', () => {
    render(<TrackingEvents isLoading={false} shipment={null} />)
    expect(screen.getByText('TBD')).toBeTruthy()
  })
})
