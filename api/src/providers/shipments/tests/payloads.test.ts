import { test } from 'vitest'
import assert from 'node:assert/strict'
import * as payloads from '#providers/shipments/payloads.ts'
import * as requests from '#providers/shipments/requests.ts'
import { handoffFor } from '#logistics/shipping/rules.ts'
import type { CarrierHandoff, Parcel } from '@dorado/contracts'

const HANDOFFS = [
  { code: 'DROPOFF_AT_FEDEX_LOCATION', name: 'Store Dropoff', requires_schedule: false },
  { code: 'CONTACT_FEDEX_TO_SCHEDULE', name: 'Carrier Pickup', requires_schedule: true },
] as unknown as CarrierHandoff[]

const ADDRESS = {
  line_1: '1 Test St',
  city: 'Dallas',
  state: 'TX',
  zip: '75001',
  country_code: 'US',
  is_residential: true,
}

const parcelWith = (handoff: CarrierHandoff): Parcel =>
  ({
    carrier_id: 'c',
    serviceType: 'FEDEX_EXPRESS_SAVER',
    carrierCode: 'FDXE',
    handoff,
    declaredValue: 1000,
    weight: { units: 'LB', value: 5 },
    dimensions: { length: 10, width: 8, height: 6, units: 'IN' },
    schedule: null,
  }) as unknown as Parcel

// LD F6. `getFulfillmentRates` quoted with pickupType `undefined` while
// `buyLabel` quoted the same parcel with `parcel.handoff.code`. FedEx rates
// differ between the two, and the SECOND answer is what is deducted from the
// customer's payout.
test('a rate quote carries the pickup type it was given, and omits nothing else', () => {
  for (const method_type of ['CARRIER DROPOFF', 'CARRIER PICKUP']) {
    const handoff = handoffFor(HANDOFFS, method_type)
    const quoted = payloads.rateQuotePayload({
      shipperAddress: ADDRESS,
      recipientAddress: ADDRESS,
      packageDetails: { weight: { units: 'LB', value: 5 } },
      pickupType: handoff.code,
      declaredValue: undefined,
    } as unknown as Parameters<typeof payloads.rateQuotePayload>[0])

    assert.equal(
      quoted.requestedShipment.pickupType,
      handoff.code,
      `a ${method_type} quote asked FedEx no question about the handoff`
    )
    assert.equal(
      requests.rateParcel(parcelWith(handoff)).pickupType,
      quoted.requestedShipment.pickupType,
      'the checkout quote and the buy-time quote ask for different handoffs'
    )
  }
})

test('a quote with no pickup type is visibly missing it, which is the state F6 described', () => {
  const quoted = payloads.rateQuotePayload({
    shipperAddress: ADDRESS,
    recipientAddress: ADDRESS,
    packageDetails: { weight: { units: 'LB', value: 5 } },
    pickupType: undefined,
    declaredValue: undefined,
  } as unknown as Parameters<typeof payloads.rateQuotePayload>[0])
  assert.equal(quoted.requestedShipment.pickupType, undefined)
})

// LD F12 - a DECISION, not a fix. This pins TODAY'S behaviour so a change is
// deliberate: every return label is bought HOLD_AT_LOCATION at the business's
// own FedEx Office, because `createShipmentPayload` defaults
// `holdAtLocation` to true and `returnLabelRequest` passes no options. The
// parcel goes back to a hold location beside Dorado instead of to the customer.
// Jacob has not ruled on whether that is intended.
test("a return label is bought HOLD_AT_LOCATION today - pinned, not endorsed", () => {
  const built = requests.returnLabelRequest('A Customer', ADDRESS as never, parcelWith(HANDOFFS[0]))
  const payload = payloads.createShipmentPayload({
    shipper: built.shipper,
    recipient: built.recipient,
    serviceType: built.serviceType,
    packageDetails: built.pkg,
    totalDeclaredValue: built.insurance.declaredValue,
  } as unknown as Parameters<typeof payloads.createShipmentPayload>[0])

  const special = payload.requestedShipment.shipmentSpecialServices as {
    specialServiceTypes?: string[]
    holdAtLocationDetail?: { locationId?: string }
  } | undefined
  assert.deepEqual(
    special?.specialServiceTypes,
    ['HOLD_AT_LOCATION'],
    'return-label HOLD_AT_LOCATION changed - if that was deliberate, this is the test to rewrite'
  )
  assert.ok(
    special?.holdAtLocationDetail?.locationId,
    'the hold location is no longer named in the payload'
  )
})
