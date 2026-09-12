import test, { before } from 'node:test'
import assert from 'node:assert/strict'
import '#env'
import { accountNumber, activeEnvironment, apiBase } from '#providers/fedex/endpoints.ts'

before(() => {
  for (const name of [
    'FEDEX_SANDBOX_CLIENT_ID',
    'FEDEX_SANDBOX_CLIENT_SECRET',
    'FEDEX_SANDBOX_ACCOUNT_NUMBER',
    'FEDEX_SANDBOX_API_URL',
  ]) {
    assert.ok(process.env[name], `${name} is not set - test:external cannot run`)
  }
})

test('refuses to run against a live-shaped FedEx configuration', () => {
  assert.equal(
    process.env.FEDEX_ENV,
    'sandbox',
    'FEDEX_ENV is not "sandbox" - refusing to run test:external\'s FedEx ' +
      'scenarios against production.'
  )
  assert.equal(activeEnvironment(), 'sandbox')
  assert.equal(apiBase(), process.env.FEDEX_SANDBOX_API_URL)
  assert.equal(accountNumber(), process.env.FEDEX_SANDBOX_ACCOUNT_NUMBER)
  assert.notEqual(
    process.env.FEDEX_SANDBOX_ACCOUNT_NUMBER,
    process.env.FEDEX_ACCOUNT_NUMBER,
    'the sandbox and production account numbers are identical - this ' +
      'environment cannot tell them apart, so refusing to run live scenarios.'
  )
})

const fedex = await import('#providers/fedex/fedex.ts')
const adapters = await import('#providers/fedex/adapters/fedex.ts')

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
const PKG = {
  weight: { units: 'LB', value: 5 },
  dimensions: { length: 10, width: 8, height: 6, units: 'IN' },
}

const SANDBOX_TRACKING_NUMBER = '449044304137821'

async function withOneRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch {
    await new Promise((r) => setTimeout(r, 4000))
    return fn()
  }
}

test('a rate quote returns priced services', async () => {
  const rates = await withOneRetry(() =>
    fedex.getRates(
      adapters.getRatesInput({
        shipperAddress: CUSTOMER_ADDRESS,
        recipientAddress: STORE_ADDRESS,
        pickupType: 'DROPOFF_AT_FEDEX_LOCATION',
        pkg: PKG,
      })
    )
  )
  assert.ok(Array.isArray(rates) && rates.length > 0, 'no rated services came back')
  assert.ok(rates[0].serviceType, 'a rate detail names no service')
  assert.ok(
    rates.some((r) => typeof r.netCharge === 'number'),
    'no rate detail carries a numeric price'
  )
})

test('a real street address validates', async () => {
  const result = await withOneRetry(() => fedex.validateAddress(CUSTOMER_ADDRESS))
  assert.equal(result.is_valid, true, 'a real street address did not validate')
  assert.equal(
    typeof result.is_residential,
    'boolean',
    'the residential classification is what the shipping quote branches on'
  )
})

test('pickup availability returns dates with times inside them', async () => {
  const options = await withOneRetry(() =>
    fedex.checkPickup(
      adapters.checkPickupInput({
        pickupAddress: CUSTOMER_ADDRESS,
        code: 'FDXE',
        readyDate: new Date(),
      })
    )
  )
  assert.ok(Array.isArray(options) && options.length > 0, 'no pickup days came back')
  for (const day of options) {
    assert.match(String(day.pickupDate), /^\d{4}-\d{2}-\d{2}$/, 'a pickup day is not a date')
    assert.ok(day.times.length > 0, 'a day survived the filter with no times in it')
  }
})

test("tracking answers for FedEx's own mock number", async () => {
  const tracking = await withOneRetry(() =>
    fedex.getTracking(adapters.getTrackingInput({ tracking_number: SANDBOX_TRACKING_NUMBER }))
  )
  assert.ok(tracking.latestStatus, 'tracking answered no status')
  assert.ok(Array.isArray(tracking.scanEvents), 'tracking carries no scan events')
})

test('a label is created on the sandbox and voided in the same run', async () => {
  const created = await withOneRetry(() =>
    fedex.createLabel(
      adapters.createLabelInput({
        shipper: {
          contact: { name: 'External Suite', phone: '7135551234' },
          address: CUSTOMER_ADDRESS,
        },
        recipient: {
          contact: { name: 'Dorado Metals', phone: '7135551234' },
          address: STORE_ADDRESS,
        },
        serviceType: 'FEDEX_GROUND',
        pickupType: 'DROPOFF_AT_FEDEX_LOCATION',
        pkg: PKG,
      })
    )
  )

  assert.ok(created.tracking_number, 'the label carries no tracking number')
  assert.ok(String(created.labelFile ?? '').length > 1000, 'the label PNG is missing or tiny')

  const voided = await fedex.cancelLabel(
    adapters.cancelLabelInput({ tracking_number: created.tracking_number })
  )
  assert.deepEqual(voided, { cancelled: true }, 'the void did not confirm')
})
