import { test } from 'vitest'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../../../..')
const PAIRS = [
  {
    what: 'weight conversion',
    api: 'api/src/shared/utils/convertWeights.ts',
    web: 'frontend/shared/utils/convertWeights.ts',
    shared: ['convertTroyOz'],
  },
]

function extract(file: string, name: string): string {
  const src = fs.readFileSync(file, 'utf8')
  const start = src.indexOf(`export function ${name}`)
  assert.notEqual(start, -1, `${name} is missing from ${path.relative(ROOT, file)}`)
  let i = src.indexOf('{', src.indexOf(')', start))
  let depth = 0
  const from = i
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) break
  }
  return src.slice(from, i + 1)
}

const ALLOWED_DIFFERENCES: readonly (readonly [RegExp | string, string])[] = []

const normalise = (s: string): string => {
  let out = s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/"/g, "'")
    .replace(/;/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  for (const [re, to] of ALLOWED_DIFFERENCES) out = out.replace(re, to)
  return out
}

for (const pair of PAIRS) {
  const API = path.join(ROOT, pair.api)
  const WEB = path.join(ROOT, pair.web)

  test(`both copies of ${pair.what} are still where they are expected`, () => {
    assert.ok(fs.existsSync(API), `${pair.api} is gone`)
    assert.ok(fs.existsSync(WEB), `${pair.web} is gone`)
  })

  for (const name of pair.shared) {
    test(`${name} has not drifted between the API and the frontend`, () => {
      const a = normalise(extract(API, name))
      const w = normalise(extract(WEB, name))
      assert.equal(
        a,
        w,
        `${name} differs between api/ and frontend/. The two must agree: one ` +
          `quotes the customer a number and the other pays it.`
      )
    })
  }
}

test('the comparison is reading real function bodies, not empty strings', () => {
  let checked = 0
  for (const pair of PAIRS) {
    for (const name of pair.shared) {
      const body = normalise(extract(path.join(ROOT, pair.api), name))
      assert.ok(body.length > 80, `${name} extracted only ${body.length} chars`)
      assert.match(body, /return/)
      checked += 1
    }
  }
  assert.equal(checked, 1, 'expected one shared function')
})

test("the rate resolution has exactly one copy, and it is the API's SQL", () => {
  const owner = path.join(ROOT, 'api/src/db/pricing/sql')
  const bands = ['purchase_quote.sql', 'order_pricing.sql'].filter((name) =>
    fs.readFileSync(path.join(owner, name), 'utf8').includes('FROM rates.rates r')
  )
  assert.equal(
    bands.length,
    2,
    "the API's rate resolution is gone from db/pricing/sql - ruling 78 put it there"
  )
  assert.ok(
    !fs.existsSync(path.join(ROOT, 'frontend/features/rates/utils/resolveRate.ts')),
    'a second copy of the rate resolution is back in the frontend - either ' +
      "delete it or put its functions back in this file's PAIRS"
  )
})
