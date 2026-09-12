import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  parseTracking,
  parseRates,
  parseAddressValidation,
  parseCreateShipment,
  parseScheduledPickup,
} from '#providers/carriers/fedex/utils/parsing.ts'

type TrackResultFixture = {
  estimatedDeliveryTimeWindow?: { window?: { ends?: string } }
  scanEvents?: {
    eventType?: string
    date?: string
    scanLocation?: { city?: string; stateOrProvinceCode?: string }
  }[]
}

const trackingResponse = (trackResults: TrackResultFixture[]) => ({
  output: { completeTrackResults: [{ trackResults }] },
})

test('a tracking response is reduced to events, newest last', () => {
  const parsed = parseTracking(
    trackingResponse([
      {
        estimatedDeliveryTimeWindow: { window: { ends: '2026-09-01T12:00:00' } },
        scanEvents: [
          {
            eventType: 'HP',
            date: '2026-08-22T10:00:00',
            scanLocation: { city: 'dallas', stateOrProvinceCode: 'TX' },
          },
          {
            eventType: 'IT',
            date: '2026-08-21T10:00:00',
            scanLocation: { city: 'memphis', stateOrProvinceCode: 'TN' },
          },
        ],
      },
    ])
  )

  assert.equal(parsed.estimatedDeliveryTime, '2026-09-01T12:00:00')
  assert.deepEqual(
    parsed.scanEvents.map((e) => e.status),
    ['In Transit', 'Delivered']
  )
  assert.equal(parsed.latestStatus, 'Delivered')
  assert.equal(parsed.deliveredAt, '2026-08-22T10:00:00')
  assert.equal(parsed.scanEvents[0].location, 'Memphis, TN', 'the city was not title-cased')
})

test('events of unrecognised types are dropped', () => {
  const parsed = parseTracking(
    trackingResponse([{ scanEvents: [{ eventType: 'ZZ', date: '2026-08-22T10:00:00' }] }])
  )

  assert.deepEqual(parsed.scanEvents, [])
  assert.equal(parsed.latestStatus, 'Status Unknown')
  assert.equal(parsed.estimatedDeliveryTime, 'TBD')
  assert.equal(parsed.deliveredAt, null)
})

test('an empty or error response throws rather than reporting nothing', () => {
  assert.throws(() => parseTracking({}), TypeError)
  assert.throws(() => parseTracking({ output: {} }), TypeError)
  assert.throws(() => parseTracking({ output: { completeTrackResults: [] } }), TypeError)
})

test('rates take the ACCOUNT rate and default the currency', () => {
  const parsed = parseRates({
    output: {
      rateReplyDetails: [
        {
          serviceType: 'FEDEX_GROUND',
          ratedShipmentDetails: [
            { rateType: 'LIST', totalNetCharge: 99 },
            { rateType: 'ACCOUNT', totalNetCharge: 42 },
          ],
        },
      ],
    },
  })

  assert.equal(parsed[0].netCharge, 42, 'the list rate was taken instead of the account rate')
  assert.equal(parsed[0].currency, 'USD')
  assert.equal(parsed[0].serviceDescription, null)
})

test('an empty address validation is invalid and residential, and is not stored', () => {
  assert.deepEqual(parseAddressValidation({}), {
    is_valid: false,
    is_residential: true,
  })
})

test('a shipment with no label yields nulls rather than throwing', () => {
  assert.deepEqual(parseCreateShipment({}), {
    tracking_number: null,
    labelFile: null,
  })
  assert.deepEqual(parseScheduledPickup({}), {
    confirmationNumber: null,
    location: null,
  })
})
