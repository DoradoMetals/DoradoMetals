import { test } from 'vitest'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOTS = [
  path.resolve(process.cwd(), '..', 'frontend'),
  path.resolve(process.cwd(), '..', 'packages', 'client', 'src'),
]

const CONTEXT = /\b(mutationFn|queryFn|request|onSuccess|onSettled|onError|onMutate)\s*:/g

// The keys that run AFTER an operation has already succeeded. An API call in
// one of these is the defect; anything else - a mutationFn, a queryFn, a helper
// a wrapper is handed - is the call itself.
const AFTER = new Set(['onSuccess', 'onSettled', 'onError', 'onMutate'])

const CALL =
  /apiRequest(?:Form|Blob)?(?:<[^>]*>)?\(\s*['"](GET|POST|PUT|DELETE|PATCH)['"],\s*(?:'([^']+)'|"([^"]+)"|`([^`]+)`)/g

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      e.name === 'node_modules' ||
      e.name === '.next' ||
      e.name.startsWith('.') ||
      e.name === 'tests'
    )
      continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) out.push(full)
  }
  return out
}

const stringEnd = (src: string, at: number): number => {
  const quote = src[at]
  let i = at + 1
  while (i < src.length) {
    if (src[i] === '\\') {
      i += 2
      continue
    }
    if (src[i] === quote) return i + 1
    i += 1
  }
  return src.length
}

// Where a `key:` value ends - the first comma or closing bracket at depth zero.
// The nearest PRECEDING key is not the enclosing one: a wrapper whose onSettled
// invalidates, called by a hook that passes the real request beside it, put
// every one of those requests inside an onSettled that had already closed.
const valueEnd = (src: string, from: number): number => {
  let depth = 0
  let i = from
  while (i < src.length) {
    const c = src[i]
    if (c === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i)
      if (nl < 0) return src.length
      i = nl + 1
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      const close = src.indexOf('*/', i + 2)
      i = close < 0 ? src.length : close + 2
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      i = stringEnd(src, i)
      continue
    }
    if (c === '(' || c === '[' || c === '{') {
      depth += 1
      i += 1
      continue
    }
    if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) return i
      depth -= 1
      i += 1
      continue
    }
    if (c === ',' && depth === 0) return i
    i += 1
  }
  return src.length
}

type Span = { key: string; start: number; end: number }

const spansOf = (src: string): Span[] =>
  [...src.matchAll(CONTEXT)].map((m) => {
    const start = m.index + m[0].length
    return { key: m[1], start, end: valueEnd(src, start) }
  })

// The INNERMOST span that contains the call, not the last one that opened.
const contextAt = (spans: Span[], at: number): string => {
  let inner: Span | null = null
  for (const span of spans) {
    if (at < span.start || at >= span.end) continue
    if (!inner || span.start > inner.start) inner = span
  }
  return inner ? inner.key : '(top level)'
}

export type Entry = { context: string; verb: string; url: string }

export const scan = (src: string): Entry[] => {
  const spans = spansOf(src)
  return [...src.matchAll(CALL)].map((m) => ({
    context: contextAt(spans, m.index),
    verb: m[1],
    url: m[2] ?? m[3] ?? m[4],
  }))
}

const ALLOWED: string[] = []

test('only the two order emails are triggered after an operation already succeeded', () => {
  const found: string[] = []
  const all: string[] = []
  let total = 0

  for (const root of ROOTS) {
    for (const file of walk(root)) {
      for (const entry of scan(fs.readFileSync(file, 'utf8'))) {
        total += 1
        const line = `${entry.context} ${entry.verb} ${entry.url}`
        all.push(line)
        if (AFTER.has(entry.context)) found.push(line)
      }
    }
  }

  // THE CONTROL AND THE FLOOR ROSE WITH THE ADMIN ORDER SCREENS. The control
  // stays the session read - a scan that cannot see the auth module is reading
  // nothing - and the floor is the calls the eleven resource modules really
  // make. Both rise again as surfaces are built.
  assert.ok(
    all.includes('queryFn GET /account/session'),
    'packages/client/src was not scanned - the known /account/session queryFn call is missing'
  )

  assert.ok(
    total >= 30,
    `only ${total} apiRequest call(s) found - the scan has stopped matching, ` +
      'and a check that reads nothing accepts everything'
  )

  assert.deepEqual(
    found.sort(),
    [...ALLOWED].sort(),
    'an API call runs after its operation has already succeeded. If it fails ' +
      'the user still sees success, nothing retries, and nobody is told - ' +
      'which is exactly how the offer-accepted email went missing. Either move ' +
      'it into the mutationFn, send it from the server, or add it here on purpose.'
  )
  console.log(`      ${total} apiRequest call(s) scanned, ${found.length} after a success`)
})

// THE SCANNER'S OWN PROOF. The first case is the write wrapper every resource
// module uses; the second is the defect it must still catch.
test('the scanner allows an invalidating onSettled and still refuses a call in one', () => {
  const invalidating = `
    function useOrderWrite(id, run) {
      const client = useQueryClient()
      return useMutation({
        mutationFn: run,
        onSettled: () => {
          client.invalidateQueries({ queryKey: keys.orders.all() })
        },
      })
    }
    export function usePatchOrder(id) {
      return useOrderWrite(id, (patch) => apiRequest('PATCH', '/orders/1', patch))
    }
  `
  assert.deepEqual(
    scan(invalidating).map((e) => `${e.context} ${e.verb} ${e.url}`),
    ['(top level) PATCH /orders/1']
  )
  assert.deepEqual(scan(invalidating).filter((e) => AFTER.has(e.context)), [])

  const effectful = `
    useMutation({
      mutationFn: (body) => apiRequest('POST', '/orders/1/finalize', body),
      onSuccess: () => {
        apiRequest('POST', '/emails/order_finalized', {})
      },
    })
  `
  assert.deepEqual(
    scan(effectful).map((e) => `${e.context} ${e.verb} ${e.url}`),
    ['mutationFn POST /orders/1/finalize', 'onSuccess POST /emails/order_finalized']
  )
  assert.deepEqual(
    scan(effectful)
      .filter((e) => AFTER.has(e.context))
      .map((e) => e.url),
    ['/emails/order_finalized']
  )
})
