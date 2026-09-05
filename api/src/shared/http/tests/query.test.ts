import { test } from 'vitest'
import assert from 'node:assert/strict'
import { oneString } from '#shared/http/query.ts'

test('a string passes through unchanged', () => {
  assert.equal(oneString('abc'), 'abc')
  assert.equal(oneString('a b'), 'a b')
})

test('an empty string is still a string and survives', () => {
  assert.equal(oneString(''), '')
})

test('an array becomes undefined and is never joined', () => {
  assert.equal(oneString(['a', 'b']), undefined)
  assert.equal(oneString(['a']), undefined)
  assert.equal(oneString([]), undefined)
})

test('an object becomes undefined', () => {
  assert.equal(oneString({ k: 'v' }), undefined)
  assert.equal(oneString(Object.create(null)), undefined)
})

test('everything else that can arrive becomes undefined', () => {
  for (const v of [undefined, null, 0, 1, true, false, NaN, Symbol('s'), 10n]) {
    assert.equal(oneString(v), undefined, `expected undefined for ${String(v)}`)
  }
})

test('a boxed String is not treated as a string', () => {
  assert.equal(oneString(new String('abc')), undefined)
})
