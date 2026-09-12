import { test, beforeEach } from 'vitest'
import assert from 'node:assert/strict'
import * as fake from '#providers/payments/moov/fake.ts'
import { eventFrom } from '#providers/payments/moov/index.ts'

beforeEach(() => fake.reset())

const request = (key: string) => ({
  sourcePaymentMethodID: 'pm_wallet',
  destinationPaymentMethodID: 'pm_customer',
  amountCents: 125_00,
  description: 'PO-1234',
  idempotencyKey: key,
})

test('a created transfer starts pending and carries the amount it was given', async () => {
  const created = await fake.rails.createTransfer(request('transfer:a'))
  assert.equal(created.status, 'pending')
  assert.equal(created.amountCents, 125_00)
  assert.ok(created.transferID.startsWith('xfer_'))
})

test('the same idempotency key replays the same transfer, not a second one', async () => {
  const first = await fake.rails.createTransfer(request('transfer:a'))
  const second = await fake.rails.createTransfer(request('transfer:a'))
  assert.equal(second.transferID, first.transferID)
})

test('a transfer advances only when the test says so', async () => {
  const created = await fake.rails.createTransfer(request('transfer:b'))
  assert.equal((await fake.rails.getTransfer(created.transferID)).status, 'pending')

  fake.advance(created.transferID, 'completed')
  assert.equal((await fake.rails.getTransfer(created.transferID)).status, 'completed')
})

test('a failure carries its reason', async () => {
  const created = await fake.rails.createTransfer(request('transfer:c'))
  const failed = fake.advance(created.transferID, 'failed', 'R01 insufficient funds')
  assert.equal(failed.failureReason, 'R01 insufficient funds')
})

test('the fake mints an event the webhook parser understands', async () => {
  const created = await fake.rails.createTransfer(request('transfer:d'))
  const event = fake.eventFor(created.transferID, 'completed')
  const parsed = eventFrom(
    JSON.stringify({
      eventID: event.eventID,
      type: event.type,
      createdOn: event.occurredAt,
      data: { transferID: event.transferID, status: event.status },
    })
  )
  assert.equal(parsed?.transferID, created.transferID)
  assert.equal(parsed?.status, 'completed')
})

test('linking by processor token offers a payment method afterwards', async () => {
  const account = await fake.rails.createAccount('Test Customer', 'test@example.invalid')
  await fake.rails.linkByProcessorToken(account.accountID, 'processor-sandbox-123')
  const offered = await fake.rails.paymentMethods(account.accountID)
  assert.equal(offered.length, 1)
  assert.equal(offered[0]?.paymentMethodType, 'ach-credit-standard')
})

test('micro deposits leave the account unverified until the amounts are confirmed', async () => {
  const account = await fake.rails.createAccount('Test Customer', 'test@example.invalid')
  const linked = await fake.rails.linkByNumbers(account.accountID, {
    holderName: 'Test Customer',
    accountType: 'checking',
    routingNumber: '021000021',
    accountNumber: '000123456789',
  })
  assert.equal(linked.status, 'new')
  assert.equal(linked.lastFourAccountNumber, '6789')

  const verified = await fake.rails.confirmMicroDeposits(
    account.accountID,
    linked.bankAccountID,
    [12, 34]
  )
  assert.equal(verified.status, 'verified')
})
