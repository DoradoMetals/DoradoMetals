import { test } from 'vitest'
import assert from 'node:assert/strict'
import { referenceFor, refiningReferenceFor } from '#transactions/rails/rules.ts'

test('referenceFor prefixes a customer order by direction', () => {
  assert.equal(referenceFor('purchase', 118), 'PO-118')
  assert.equal(referenceFor('sale', 118), 'SO-118')
  assert.equal(referenceFor(null, 118), 'PO-118')
})

test('refiningReferenceFor prefixes a refiner order by direction: RP for a buy, RS for a sell', () => {
  assert.equal(refiningReferenceFor('buy', 1042), 'RP-1042')
  assert.equal(refiningReferenceFor('sell', 1042), 'RS-1042')
})
