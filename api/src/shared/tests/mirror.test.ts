import { test } from 'vitest'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../../../..')

// THERE IS NOTHING TO MIRROR RIGHT NOW (the frontend nuke, ruling 99).
//
// This held one pair: `convertTroyOz`, written twice because the API quoted a
// weight and the browser re-showed it. The frontend copy went with the sell
// and buy surfaces, so the drift this file exists to catch cannot happen -
// there is only one copy left, which is the state the file wants.
//
// The list is empty rather than the file deleted, because the SECOND copy is
// what comes back first: the moment a surface shows a weight somebody will
// reach for `convertTroyOz` in the browser, and this is where that copy gets
// pinned to the API's. `no second copy has come back` below fails the day one
// appears without an entry here.
const PAIRS: {
  what: string
  api: string
  web: string
  shared: string[]
}[] = []

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
  for (const pair of PAIRS) {
    for (const name of pair.shared) {
      const body = normalise(extract(path.join(ROOT, pair.api), name))
      assert.ok(body.length > 80, `${name} extracted only ${body.length} chars`)
      assert.match(body, /return/)
    }
  }
})

// THE GUARD THAT REPLACES THE PAIR. An empty PAIRS list passes every test
// above trivially, and a check that reads nothing accepts everything - so the
// emptiness has to be asserted from the other side. These are the frontend
// files that USED to hold a second copy of a number the API also computes. If
// one comes back, it is either a duplicate to delete or a pair to declare.
test('no second copy of an API calculation has come back to the frontend', () => {
  const copies = [
    'frontend/shared/utils/convertWeights.ts',
    'frontend/features/rates/utils/resolveRate.ts',
  ].filter((rel) => fs.existsSync(path.join(ROOT, rel)))

  assert.deepEqual(
    copies,
    [],
    'a calculation the API owns has a second copy in the frontend again. ' +
      'Either delete it, or add the pair to PAIRS so the two are pinned ' +
      'together: one quotes the customer a number and the other pays it.'
  )
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
