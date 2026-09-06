import { test } from 'vitest'
import assert from 'node:assert/strict'
import * as payloads from '#providers/shipments/payloads.ts'
import * as requests from '#providers/shipments/requests.ts'
import * as adapters from '#providers/shipments/adapters/fedex.ts'
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

// RULING 89 (Jacob, 2026-09-07), executed. HOLD_AT_LOCATION stays; where the
// parcel is held is the business's default return location, read from
// places.locations and handed to the request builder. Nothing about it is
// written into the adapter any more, so this test supplies the row and proves
// every field of the payload came from it.
const HOLD = {
  code: 'TEST1',
  type: 'FEDEX_OFFICE',
  company_name: 'A Print And Ship Center',
  phone_number: '5550000000',
  address: {
    line_1: '1 Hold Street',
    line_2: null,
    city: 'Farmers Branch',
    state: 'TX',
    zip: '75244',
    country_code: 'US',
    is_residential: false,
  },
}

const returnPayload = (hold: typeof HOLD | null) => {
  const built = requests.returnLabelRequest(
    'A Customer',
    ADDRESS as never,
    parcelWith(HANDOFFS[0]),
    hold as never
  )
  return payloads.createShipmentPayload(
    adapters.createLabelInput(built) as unknown as Parameters<
      typeof payloads.createShipmentPayload
    >[0]
  )
}

const specialOf = (payload: ReturnType<typeof payloads.createShipmentPayload>) =>
  payload.requestedShipment.shipmentSpecialServices as
    | {
        specialServiceTypes?: string[]
        holdAtLocationDetail?: {
          locationId?: string
          locationType?: string
          locationContactAndAddress?: {
            address?: { streetLines?: string[]; postalCode?: string }
            contact?: { companyName?: string; phoneNumber?: string }
          }
        }
      }
    | undefined

test('a return label is held at the row the caller read, field for field', () => {
  const special = specialOf(returnPayload(HOLD))

  assert.deepEqual(special?.specialServiceTypes, ['HOLD_AT_LOCATION'], 'ruling 89 keeps the hold')
  assert.equal(special?.holdAtLocationDetail?.locationId, HOLD.code)
  assert.equal(special?.holdAtLocationDetail?.locationType, HOLD.type)
  assert.deepEqual(
    special?.holdAtLocationDetail?.locationContactAndAddress?.address?.streetLines,
    ['1 Hold Street']
  )
  assert.equal(
    special?.holdAtLocationDetail?.locationContactAndAddress?.address?.postalCode,
    HOLD.address.zip
  )
  assert.equal(
    special?.holdAtLocationDetail?.locationContactAndAddress?.contact?.companyName,
    HOLD.company_name
  )
  assert.equal(
    special?.holdAtLocationDetail?.locationContactAndAddress?.contact?.phoneNumber,
    HOLD.phone_number
  )
})

test('no hold location, no hold service - nothing is defaulted in the adapter', () => {
  assert.equal(
    specialOf(returnPayload(null)),
    undefined,
    'the payload still names a place the caller never gave it'
  )
})

test("the inbound leg travels to the same row's address", () => {
  const built = requests.inboundLabelRequest(
    ADDRESS as never,
    'A Customer',
    parcelWith(HANDOFFS[0]),
    HOLD as never
  )
  assert.equal(built.recipient.address, HOLD.address)
})
