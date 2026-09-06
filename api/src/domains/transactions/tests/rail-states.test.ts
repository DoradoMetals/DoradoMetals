import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  centsOf,
  movesForward,
  openingState,
  referenceFor,
  settledState,
  stateFromMoov,
  transferKeyFor,
} from '#transactions/rails/rules.ts'

test('a payout opens Not sent and a charge opens Due', () => {
  assert.equal(openingState('payout'), 'Not sent')
  assert.equal(openingState('charge'), 'Due')
})

test('a payout settles Sent and a charge settles Received', () => {
  assert.equal(settledState('payout'), 'Sent')
  assert.equal(settledState('charge'), 'Received')
})

test('the machine only ever moves forward', () => {
  assert.equal(movesForward('Not sent', 'Processing'), true)
  assert.equal(movesForward('Processing', 'Sent'), true)
  assert.equal(movesForward('Due', 'Received'), true)
  assert.equal(movesForward('Sent', 'Processing'), false)
  assert.equal(movesForward('Received', 'Due'), false)
  assert.equal(movesForward('Processing', 'Processing'), false)
})

test('a failure is reachable from anywhere that is not finished', () => {
  assert.equal(movesForward('Not sent', 'Failed'), true)
  assert.equal(movesForward('Processing', 'Failed'), true)
  assert.equal(movesForward('Sent', 'Failed'), true)
  assert.equal(movesForward('Failed', 'Processing'), false)
})

test("Moov's statuses map onto the two machines", () => {
  assert.equal(stateFromMoov('payout', 'created'), 'Processing')
  assert.equal(stateFromMoov('payout', 'pending'), 'Processing')
  assert.equal(stateFromMoov('payout', 'completed'), 'Sent')
  assert.equal(stateFromMoov('charge', 'completed'), 'Received')
  assert.equal(stateFromMoov('charge', 'reversed'), 'Failed')
  assert.equal(stateFromMoov('payout', 'failed'), 'Failed')
})

test('a status nobody has mapped moves nothing', () => {
  assert.equal(stateFromMoov('payout', 'invented'), undefined)
  assert.equal(stateFromMoov('payout', null), undefined)
})

test('the memo reference names the order the way a customer types it', () => {
  assert.equal(referenceFor('sale', 1234), 'SO-1234')
  assert.equal(referenceFor('purchase', 4242), 'PO-4242')
  assert.equal(referenceFor(null, 7), 'PO-7')
})

test('the idempotency key names the row, so a double click replays it', () => {
  assert.equal(transferKeyFor('abc'), 'transfer:abc')
  assert.equal(transferKeyFor('abc'), transferKeyFor('abc'))
})

test('money crosses to the provider in cents', () => {
  assert.equal(centsOf(1200.5), 120050)
  assert.equal(centsOf(0.1 + 0.2), 30)
})
