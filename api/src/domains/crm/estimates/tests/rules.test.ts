import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Conflict, Invalid, NotFound } from '#shared/errors.ts'
import * as rules from '#crm/estimates/rules.ts'

const A_UUID = '00000000-0000-4000-8000-000000000001'

const COMPLETE = {
  kind_id: A_UUID,
  metal_id: 'Gold',
  weight: 1,
  unit_id: A_UUID,
  purity_id: A_UUID,
}

test('assertLead refuses nothing and passes a row', () => {
  assert.throws(() => rules.assertLead(null, A_UUID), NotFound)
  assert.throws(() => rules.assertLead(undefined, A_UUID), NotFound)
  rules.assertLead({ id: A_UUID }, A_UUID)
})

test('assertItem refuses nothing and passes a row', () => {
  assert.throws(() => rules.assertItem(null, A_UUID), NotFound)
  rules.assertItem({ id: A_UUID }, A_UUID)
})

test('assertOnePurity refuses both answers and refuses neither', () => {
  assert.throws(() => rules.assertOnePurity(A_UUID, 0.5), Invalid)
  assert.throws(() => rules.assertOnePurity(null, null), Invalid)
  rules.assertOnePurity(A_UUID, null)
  rules.assertOnePurity(null, 0.5)
})

test('assertCreatable names the fact that is missing', () => {
  rules.assertCreatable(COMPLETE)

  assert.throws(() => rules.assertCreatable({ ...COMPLETE, kind_id: undefined }), /kind_id/)
  assert.throws(() => rules.assertCreatable({ ...COMPLETE, metal_id: undefined }), /metal_id/)
  assert.throws(() => rules.assertCreatable({ ...COMPLETE, unit_id: undefined }), /unit_id/)
  assert.throws(() => rules.assertCreatable({ ...COMPLETE, weight: undefined }), /weight/)
})

test('assertCreatable refuses a weight of nothing or less', () => {
  assert.throws(() => rules.assertCreatable({ ...COMPLETE, weight: 0 }), Invalid)
  assert.throws(() => rules.assertCreatable({ ...COMPLETE, weight: -1 }), Invalid)
})

test('assertCreatable carries the one-purity rule with it', () => {
  assert.throws(
    () => rules.assertCreatable({ ...COMPLETE, custom_purity: 0.5 }),
    /exactly one of purity_id or custom_purity/
  )
  assert.throws(() => rules.assertCreatable({ ...COMPLETE, purity_id: null }), Invalid)
  rules.assertCreatable({ ...COMPLETE, purity_id: null, custom_purity: 0.5 })
})

test('a domain error is never a bare Error', () => {
  assert.ok(new Invalid('x') instanceof Error)
  assert.ok(new NotFound('x') instanceof Error)
  assert.ok(new Conflict('x') instanceof Error)
})
