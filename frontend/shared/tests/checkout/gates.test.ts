import { describe, expect, test } from 'vitest'
import type { CarrierHandoff } from '@dorado/contracts'

import { readyForPayment, readyToPlace, resolveHandoff } from '@/shared/utils/gates'

// `readyForRates` is GONE with the columns it read (rulings 69/70, migration
// 128): the parcel's own `missing` gates the rate query now, inside
// @dorado/client's `useFulfillmentRates`.

describe('readyForPayment', () => {
  test('blocked while anything but the money step remains', () => {
    expect(readyForPayment(['carrier_service_id', 'payment_details_id'])).toBe(false)
  })

  test('blocked while a handover step the fulfillment spliced in remains', () => {
    expect(readyForPayment(['pickup_date', 'pickup_time'])).toBe(false)
  })

  test('ready holding only the purchase money step', () => {
    expect(readyForPayment(['payment_details_id'])).toBe(true)
  })

  test('ready on an empty list', () => {
    expect(readyForPayment([])).toBe(true)
  })
})

describe('readyToPlace', () => {
  test('blocked while anything remains', () => {
    expect(readyToPlace(['payment_details_id'])).toBe(false)
  })

  test('ready on an empty list', () => {
    expect(readyToPlace([])).toBe(true)
  })
})

describe('resolveHandoff', () => {
  const dropoff: CarrierHandoff = {
    code: 'DROP',
    name: 'Drop off',
    requires_schedule: false,
    has_dropoff_locations: true,
    display_order: 0,
  }
  const collect: CarrierHandoff = {
    code: 'COLLECT',
    name: 'Courier pickup',
    requires_schedule: true,
    has_dropoff_locations: false,
    display_order: 1,
  }
  const handoffs = [dropoff, collect]

  test('a dropoff method resolves to the non-schedule handoff', () => {
    expect(resolveHandoff(handoffs, 'CARRIER DROPOFF')).toEqual(dropoff)
  })

  test('a pickup method resolves to the schedule handoff', () => {
    expect(resolveHandoff(handoffs, 'CARRIER PICKUP')).toEqual(collect)
  })

  test('nothing chosen when the draft has no method type yet', () => {
    expect(resolveHandoff(handoffs, null)).toBeNull()
    expect(resolveHandoff(handoffs, undefined)).toBeNull()
  })

  // A method that is not a carrier handoff at all - PICKUP, APPOINTMENT -
  // resolves to the non-schedule handoff, which is what the server's own
  // `handoffFor` does with the same input. The shipping step never renders
  // this selector for those categories.
  test('a non-carrier method resolves to the dropoff handoff', () => {
    expect(resolveHandoff(handoffs, 'PICKUP')).toEqual(dropoff)
  })
})
