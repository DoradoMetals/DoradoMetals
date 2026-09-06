import { test } from 'vitest'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { allRoutes } from '../../../../scripts/route-guards.ts'

const ROOTS = [
  path.resolve(process.cwd(), '..', 'frontend'),
  path.resolve(process.cwd(), '..', 'packages', 'client', 'src'),
]

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next' || e.name.startsWith('.')) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full)
  }
  return out
}

const PATTERNS = [
  /apiRequest(?:<[^>]*>)?\(\s*['"](GET|POST|PUT|PATCH|DELETE)['"],\s*['"]([^'"]+)['"]/g,
  /url:\s*['"]([^'"]+)['"],\s*\n?\s*method:\s*['"](GET|POST|PUT|PATCH|DELETE)['"]/g,
  /method:\s*['"](GET|POST|PUT|PATCH|DELETE)['"],\s*\n?\s*url:\s*['"]([^'"]+)['"]/g,
]

const collect = () => {
  const calls = []
  let skipped = 0
  for (const file of ROOTS.flatMap((root) => walk(root))) {
    const src = fs.readFileSync(file, 'utf8')
    for (const [i, re] of PATTERNS.entries()) {
      for (const m of src.matchAll(re)) {
        const [verb, url] = i === 1 ? [m[2], m[1]] : [m[1], m[2]]
        if (url.includes('${')) {
          skipped += 1
          continue
        }
        calls.push({ file: path.relative(path.resolve(process.cwd(), '..'), file), verb, url })
      }
    }
    for (const m of src.matchAll(
      /apiRequest(?:<[^>]*>)?\(\s*['"](?:GET|POST|PUT|PATCH|DELETE)['"],\s*`/g
    ))
      skipped += 1
  }
  return { calls, skipped }
}

const DELIBERATE_404: Record<string, string | undefined> = {}

const toRoute = (url: string) =>
  url.startsWith('/api/') ? url : `/api${url.startsWith('/') ? '' : '/'}${url}`

test('every frontend API call names a route the API actually has', () => {
  const known = new Set(allRoutes.filter((r) => r.url).map((r) => `${r.verb} ${r.url}`))
  assert.ok(known.size > 100, `only ${known.size} routes known - the route walk is wrong`)

  // THE FLOOR RISES WITH EACH SURFACE. It was 45 before the nuke, 9 after it,
  // and it is 30 now that the admin order screens brought back eight resource
  // modules - orders, refining, payments, fulfillments, shipping, spots, users
  // and crm - on top of the ten `/account/*` calls. Only literal URLs count, so
  // a hook whose path is a template contributes nothing to it. A floor above the real
  // count fails the SCAN rather than the code, which is the failure this floor
  // exists to prevent, so it tracks what is actually there.
  const { calls, skipped } = collect()
  assert.ok(
    calls.length >= 30,
    `only ${calls.length} frontend call(s) found - the patterns have stopped ` +
      'matching, and a check that reads nothing accepts everything'
  )

  const unresolved = calls.filter((c) => !known.has(`${c.verb} ${toRoute(c.url)}`))
  const missing = unresolved
    .filter((c) => !DELIBERATE_404[`${c.verb} ${toRoute(c.url)}`])
    .map((c) => `${c.verb} ${toRoute(c.url)}  (${c.file})`)

  assert.deepEqual(
    missing,
    [],
    'the frontend calls a route the API does not have - it 404s, and if the ' +
      'call sits in an onSuccess the user sees success anyway'
  )

  const stale = Object.keys(DELIBERATE_404).filter(
    (k) => !unresolved.some((c) => `${c.verb} ${toRoute(c.url)}` === k)
  )
  assert.deepEqual(
    stale,
    [],
    'a call listed as a deliberate 404 now resolves - remove it from DELIBERATE_404'
  )
  console.log(
    `      ${calls.length} frontend call(s) checked against ${known.size} routes` +
      `, ${skipped} template path(s) skipped` +
      `, ${Object.keys(DELIBERATE_404).length} deliberate 404(s)`
  )
})
