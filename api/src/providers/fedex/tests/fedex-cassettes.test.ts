import { test, beforeAll, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import { withCassette } from '#shared/testing/cassettes.ts'
import * as fedex from '#providers/fedex/fedex.ts'
import * as adapters from '#providers/fedex/adapters/fedex.ts'

const CUSTOMER_ADDRESS = {
  line_1: '6100 Main St',
  city: 'Houston',
  state: 'TX',
  zip: '77005',
  country_code: 'US',
  is_residential: true,
}
const STORE_ADDRESS = {
  line_1: '1600 Lamar St',
  city: 'Houston',
  state: 'TX',
  zip: '77010',
  country_code: 'US',
  is_residential: false,
}
// The recorded exchange carries a hold-at-location detail the adapter used to
// supply from a constant. Ruling 89 moved that to a places.locations row the
// caller reads, so the test hands over the same values - already in FedEx's own
// shape, which the adapter passes through untouched - and the recorded request
// still matches.
const RECORDED_HOLD = {
  code: 'ADSK',
  type: 'FEDEX_OFFICE',
  company_name: 'FedEx Office Print & Ship Center',
  phone_number: '9727880816',
  address: {
    streetLines: ['13605 Midway Rd'],
    city: 'Farmers Branch',
    stateOrProvinceCode: 'TX',
    postalCode: '75244',
    countryCode: 'US',
  },
}
const PKG = {
  weight: { units: 'LB', value: 5 },
  dimensions: { length: 10, width: 8, height: 6, units: 'IN' },
}

const SANDBOX_TRACKING_NUMBER = '449044304137821'

const READY_DATE = new Date('2026-01-01T09:00:00Z')

let previousEnv: string | undefined

beforeAll(() => {
  previousEnv = process.env.FEDEX_ENV
  process.env.FEDEX_ENV = 'sandbox'
})

afterAll(() => {
  if (previousEnv === undefined) delete process.env.FEDEX_ENV
  else process.env.FEDEX_ENV = previousEnv
})

test('a rate quote comes back as priced services', async () => {
  const rates = await withCassette('fedex/rate-quote.json', () =>
    fedex.getRates(
      adapters.getRatesInput({
        shipperAddress: CUSTOMER_ADDRESS,
        recipientAddress: STORE_ADDRESS,
        pickupType: 'DROPOFF_AT_FEDEX_LOCATION',
        pkg: PKG,
      })
    )
  )

  assert.ok(Array.isArray(rates), 'getRates did not return a list')
  assert.ok(rates.length > 0, 'no rated services came back')
  for (const rate of rates) {
    assert.ok(rate.serviceType, 'a rate detail names no service')
    assert.equal(typeof rate.currency, 'string')
  }
  assert.ok(
    rates.some((r) => typeof r.netCharge === 'number'),
    'no rate detail carries a numeric price - parseRates found no ACCOUNT rate'
  )
})

test('an address the carrier recognises validates', async () => {
  const result = await withCassette('fedex/address-validation.json', () =>
    fedex.validateAddress(CUSTOMER_ADDRESS)
  )

  assert.equal(result.is_valid, true, 'a real street address did not validate')
  assert.equal(
    typeof result.is_residential,
    'boolean',
    'the residential classification is what the shipping quote branches on'
  )
})

test('pickup availability comes back as dates with times inside them', async () => {
  const options = await withCassette('fedex/pickup-availability.json', () =>
    fedex.checkPickup(
      adapters.checkPickupInput({
        pickupAddress: CUSTOMER_ADDRESS,
        code: 'FDXE',
        readyDate: READY_DATE,
      })
    )
  )

  assert.ok(Array.isArray(options), 'checkPickup did not return a list')
  assert.ok(options.length > 0, 'no pickup days came back')
  for (const day of options) {
    assert.match(String(day.pickupDate), /^\d{4}-\d{2}-\d{2}$/, 'a pickup day is not a date')
    assert.ok(day.times.length > 0, 'a day survived the filter with no times in it')
  }
})

test('tracking answers with scan events and a latest status', async () => {
  const tracking = await withCassette('fedex/tracking.json', () =>
    fedex.getTracking(adapters.getTrackingInput({ tracking_number: SANDBOX_TRACKING_NUMBER }))
  )

  assert.ok(tracking.latestStatus, 'tracking answered no status')
  assert.notEqual(
    tracking.latestStatus,
    'Status Unknown',
    'parseTracking recognised nothing - the status map no longer covers this response'
  )
  assert.ok(Array.isArray(tracking.scanEvents), 'tracking carries no scan events')
  assert.ok(tracking.scanEvents.length > 0, 'the recorded parcel has no recognised scans')
  for (const event of tracking.scanEvents) {
    assert.equal(typeof event.status, 'string')
    assert.notEqual(event.status, 'Unknown', 'a scan event mapped to nothing')
  }
})

test('a label is created and then voided', async () => {
  const { label, voided } = await withCassette('fedex/create-and-void-label.json', async () => {
    const created = await fedex.createLabel(
      adapters.createLabelInput({
        shipper: {
          contact: { name: 'Cassette Suite', phone: '7135551234' },
          address: CUSTOMER_ADDRESS,
        },
        recipient: {
          contact: { name: 'Dorado Metals', phone: '7135551234' },
          address: STORE_ADDRESS,
        },
        serviceType: 'FEDEX_GROUND',
        pickupType: 'DROPOFF_AT_FEDEX_LOCATION',
        pkg: PKG,
        hold: RECORDED_HOLD as never,
      })
    )
    const cancelled = await fedex.cancelLabel(
      adapters.cancelLabelInput({ tracking_number: created.tracking_number })
    )
    return { label: created, voided: cancelled }
  })

  assert.ok(label.tracking_number, 'the label carries no tracking number')
  assert.match(String(label.tracking_number), /^\d{12,}$/, 'that is not a tracking number')
  assert.ok(label.labelFile, 'parseCreateShipment found no label document')
  assert.ok(Buffer.from(label.labelFile, 'base64').length > 0, 'the label decodes to nothing')
  assert.deepEqual(voided, { cancelled: true }, 'the void did not confirm')
})
