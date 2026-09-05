import '#env'
import { test, afterEach, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import {
  accountNumber,
  trackingAccountNumber,
  activeEnvironment,
  apiBase,
} from '#providers/shipments/endpoints.ts'

const saved = { ...process.env }

beforeAll(() => {
  for (const name of [
    'FEDEX_API_URL',
    'FEDEX_SANDBOX_API_URL',
    'FEDEX_ACCOUNT_NUMBER',
    'FEDEX_SANDBOX_ACCOUNT_NUMBER',
    'FEDEX_TRACKING_SANDBOX_ACCOUNT_NUMBER',
  ]) {
    assert.ok(process.env[name], `${name} is not set - these tests would pass vacuously`)
  }
})

afterEach(() => {
  process.env.FEDEX_ENV = saved.FEDEX_ENV
  if (saved.FEDEX_ENV === undefined) delete process.env.FEDEX_ENV
})

test('the default is production, not sandbox', () => {
  delete process.env.FEDEX_ENV
  assert.equal(activeEnvironment(), 'production')
  assert.equal(apiBase(), process.env.FEDEX_API_URL)
  assert.equal(accountNumber(), process.env.FEDEX_ACCOUNT_NUMBER)
})

test('anything other than the word sandbox is production', () => {
  for (const value of ['', 'prod', 'SANDBOX', 'test', 'true']) {
    process.env.FEDEX_ENV = value
    assert.equal(activeEnvironment(), 'production', `FEDEX_ENV=${value} selected the sandbox`)
  }
})

test('sandbox selects the sandbox host and the sandbox account', () => {
  process.env.FEDEX_ENV = 'sandbox'
  assert.equal(activeEnvironment(), 'sandbox')
  assert.equal(apiBase(), process.env.FEDEX_SANDBOX_API_URL)
  assert.equal(accountNumber(), process.env.FEDEX_SANDBOX_ACCOUNT_NUMBER)
  assert.equal(trackingAccountNumber(), process.env.FEDEX_TRACKING_SANDBOX_ACCOUNT_NUMBER)
})

test('the sandbox account is a different account from the live one', () => {
  process.env.FEDEX_ENV = 'sandbox'
  const sandboxAccount = accountNumber()
  process.env.FEDEX_ENV = 'production'
  assert.notEqual(
    sandboxAccount,
    accountNumber(),
    'the two environments share an account number - one of them is misconfigured'
  )
})

test('a built payload carries the account the switch selected', async () => {
  const { createShipmentPayload } = await import('#providers/shipments/payloads.ts')
  const input = {
    shipper: { contact: {}, address: {} },
    recipient: { contact: {}, address: {} },
    packageDetails: { weight: { units: 'LB', value: 1 }, dimensions: {} },
  }

  const sandboxAccount = process.env.FEDEX_SANDBOX_ACCOUNT_NUMBER
  const liveAccount = process.env.FEDEX_ACCOUNT_NUMBER
  assert.ok(sandboxAccount, 'FEDEX_SANDBOX_ACCOUNT_NUMBER is unset - nothing to compare')
  assert.ok(liveAccount, 'FEDEX_ACCOUNT_NUMBER is unset - nothing to compare')

  process.env.FEDEX_ENV = 'sandbox'
  const sandboxPayload = JSON.stringify(createShipmentPayload(input))
  assert.ok(
    sandboxPayload.includes(sandboxAccount),
    'a sandbox label was built against the live account'
  )

  process.env.FEDEX_ENV = 'production'
  const livePayload = JSON.stringify(createShipmentPayload(input))
  assert.ok(livePayload.includes(liveAccount))
})
