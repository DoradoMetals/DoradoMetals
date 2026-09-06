import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  assertHandoff,
  assertOneShippableCarrier,
  assertPickup,
  assertShippingType,
  declaredValue,
  handoffFor,
  offeredRates,
  parcelFor,
  parcelWeightLb,
  quotedCharge,
  scheduleFromPickup,
  scheduleOf,
  trackingStatus,
} from '#logistics/shipping/rules.ts'
import { Invalid } from '#shared/errors.ts'
import type {
  CarrierHandoff,
  CarrierRateQuote,
  CarrierServiceOption,
  FulfillmentPickup,
  LabelService,
  Package,
  TrackingStep,
} from '@dorado/contracts'

test('the parcel weighs what its items weigh, converted to pounds', () => {
  const weight = parcelWeightLb([{ pre_melt: 453.59237, unit: 'g', quantity: 1 }], {
    min_weight_lb: 0.5,
  })
  assert.ok(Math.abs(weight - 1) < 1e-9, `expected ~1 lb, got ${weight}`)
})

test("a bullion line's weight scales with quantity", () => {
  const weight = parcelWeightLb([{ pre_melt: 1, unit: 't oz', quantity: 6 }], { min_weight_lb: 0 })
  assert.ok(weight > 0 && weight < 1, `six troy ounces should weigh under a pound, got ${weight}`)
})

test("the box's own minimum wins when the items weigh less", () => {
  const weight = parcelWeightLb([{ pre_melt: 1, unit: 't oz', quantity: 1 }], { min_weight_lb: 2 })
  assert.equal(weight, 2, "a coin weighs far less than the box's own minimum")
})

test('a null package and an unrecognised unit are both worth nothing extra', () => {
  assert.equal(parcelWeightLb([{ pre_melt: 5, unit: 'kg', quantity: 1 }], null), 0)
  assert.equal(parcelWeightLb([], undefined), 0)
})

test('declaredValue passes a positive total through unchanged', () => {
  assert.equal(declaredValue(2500), 2500)
})

test('declaredValue floors at zero rather than going negative or NaN', () => {
  assert.equal(declaredValue(-100), 0)
  assert.equal(declaredValue(NaN), 0)
  assert.equal(declaredValue(0), 0)
})

const DROPOFF: CarrierHandoff = {
  code: 'DROPOFF',
  name: 'Store Dropoff',
  requires_schedule: false,
  has_dropoff_locations: true,
  display_order: 1,
}
const COLLECTION: CarrierHandoff = {
  code: 'PICKUP',
  name: 'Carrier Pickup',
  requires_schedule: true,
  has_dropoff_locations: false,
  display_order: 2,
}
const A_SERVICE = {
  carrier_id: 'c',
  id: 's',
  name: 'Express Saver',
  code: 'SAVER',
  carrier_code: 'FDXE',
  display_order: 1,
  max_insured_value: 10_000,
} as LabelService
const A_BOX = { length: 10, width: 8, height: 6 } as unknown as Package

test('a carrier pickup needs a date and a time, and a dropoff carries no slot', () => {
  const slot = scheduleOf('2026-09-04', '14:00')
  const collected = parcelFor(A_SERVICE, A_BOX, COLLECTION, 2500, 2, slot)
  assert.deepEqual(collected.schedule, { date: '2026-09-04', time: '14:00' })
  assert.equal(collected.weight.value, 2)
  assert.equal(collected.declaredValue, 2500)
  assert.equal(collected.serviceType, 'SAVER')
  assert.equal(collected.carrierCode, 'FDXE')

  assert.equal(parcelFor(A_SERVICE, A_BOX, DROPOFF, 0, 2, slot).schedule, null)
  assert.throws(() => parcelFor(A_SERVICE, A_BOX, COLLECTION, 0, 2, null), Invalid)
})

test('a parcel needs a real box and a weight above zero', () => {
  assert.throws(() => parcelFor(A_SERVICE, undefined, DROPOFF, 0, 2, null), Invalid)
  assert.throws(() => parcelFor(A_SERVICE, A_BOX, DROPOFF, 0, 0, null), Invalid)
})

test('the handoff a method means is the one whose schedulability matches', () => {
  const handoffs = [DROPOFF, COLLECTION]
  assert.equal(handoffFor(handoffs, 'CARRIER PICKUP'), COLLECTION)
  assert.equal(handoffFor(handoffs, 'CARRIER DROPOFF'), DROPOFF)
  assert.equal(handoffFor(handoffs, null), DROPOFF)
  assert.throws(() => handoffFor([], 'CARRIER PICKUP'), Error)
})

test("the courier slot comes off the order's own pickup row", () => {
  assert.deepEqual(
    scheduleFromPickup({ start_time: '2026-09-04T14:30:00.000Z' } as FulfillmentPickup),
    { date: '2026-09-04', time: '14:30' }
  )
  assert.equal(scheduleFromPickup(undefined), null)
  assert.equal(scheduleFromPickup({ start_time: null } as FulfillmentPickup), null)
  assert.equal(scheduleOf('2026-09-04', null), null)
})

test('postage with no quote is refused rather than priced at nothing', () => {
  assert.equal(
    quotedCharge(
      [
        { serviceType: 'SAVER', netCharge: 24.5 },
        { serviceType: 'OTHER', netCharge: 9 },
      ],
      'SAVER'
    ),
    24.5
  )
  assert.throws(() => quotedCharge([{ serviceType: 'OTHER', netCharge: 9 }], 'SAVER'), Invalid)
  assert.throws(() => quotedCharge([{ serviceType: 'SAVER', netCharge: null }], 'SAVER'), Invalid)
})

test('offeredRates matches a quote to its offered service and marks the chosen one', () => {
  const quoted: CarrierRateQuote[] = [
    {
      serviceType: 'FEDEX_GROUND',
      packagingType: 'YOUR_PACKAGING',
      netCharge: 12.34,
      currency: 'USD',
      deliveryDay: '2026-09-10',
      transitTime: 'TWO_DAYS',
      serviceDescription: 'Ground',
    },
    {
      serviceType: null,
      packagingType: null,
      netCharge: null,
      currency: 'USD',
      deliveryDay: null,
      transitTime: null,
      serviceDescription: null,
    },
  ]
  const offered: CarrierServiceOption[] = [
    {
      id: 'svc-1',
      code: 'FEDEX_GROUND',
      name: 'Ground',
      carrier_code: 'FDXG',
      display_order: 0,
      max_insured_value: 1000,
    },
    {
      id: 'svc-2',
      code: 'FEDEX_EXPRESS',
      name: 'Express',
      carrier_code: 'FDXE',
      display_order: 1,
      max_insured_value: 2000,
    },
  ]

  const rates = offeredRates(quoted, offered, 'svc-2')

  assert.equal(rates.length, 2)
  const ground = rates.find((r) => r.carrier_service_id === 'svc-1')!
  assert.equal(ground.netCharge, 12.34)
  assert.equal(ground.selected, false)
  const express = rates.find((r) => r.carrier_service_id === 'svc-2')!
  assert.equal(
    express.netCharge,
    null,
    'an offered service with no matching quote prices at nothing'
  )
  assert.equal(express.selected, true)
})

test('assertHandoff refuses a handoff the carrier no longer offers', () => {
  assert.throws(() => assertHandoff(null, 'ship-1'), /no longer offers/)
  assert.doesNotThrow(() => assertHandoff({ code: 'x' } as CarrierHandoff, 'ship-1'))
})

test('assertPickup refuses an id nothing names', () => {
  assert.throws(() => assertPickup(undefined, 'pk-1'), /no pickup pk-1/)
  assert.doesNotThrow(() => assertPickup({ id: 'pk-1' }, 'pk-1'))
})

test('assertShippingType accepts only the three real directions', () => {
  for (const ok of ['Inbound', 'Outbound', 'Return']) {
    assert.doesNotThrow(() => assertShippingType(ok))
  }
  assert.throws(() => assertShippingType('Sideways'), /invalid shippingType/)
})

test('trackingStatus falls back to the last reached stage once the carrier stops reporting one', () => {
  const timeline: TrackingStep[] = [
    { stage: 'Label Created', location: null, scan_time: null, reached: true },
    {
      stage: 'In Transit',
      location: 'Memphis, TN',
      scan_time: '2026-09-01T00:00:00Z',
      reached: true,
    },
    { stage: 'Delivered', location: null, scan_time: null, reached: false },
  ]
  assert.equal(trackingStatus(null, timeline), 'In Transit')
  assert.equal(trackingStatus(null, []), null, 'an empty timeline has no last reached stage')
})

test('assertOneShippableCarrier refuses ambiguity as loudly as absence', () => {
  assert.throws(() => assertOneShippableCarrier([]), /No carrier/)
  assert.doesNotThrow(() => assertOneShippableCarrier([{ name: 'FedEx' }]))
  assert.throws(
    () => assertOneShippableCarrier([{ name: 'FedEx' }, { name: 'UPS' }]),
    /More than one carrier.*FedEx, UPS/
  )
})
