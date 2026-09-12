import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, anonymous } from '#shared/testing/session.ts'
import { TEST_ACTOR, TEST_CUSTOMER } from '#shared/testing/actor.ts'
import { inPinnedTransaction, outside } from '#shared/testing/pinned-pool.ts'
import { adminRoutes, allRoutes } from '../../../../../scripts/route-guards.ts'
import type { Route } from '../../../../../scripts/route-guards.ts'
import { sourceRoot, wildcardRoots } from '../../../../../scripts/lib/layout.ts'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const API_ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..')
const SRC = sourceRoot(API_ROOT)
const ALIAS = wildcardRoots(API_ROOT)
const aliasPath = (spec: string): string => {
  const [head, ...rest] = spec.split('/')
  return [ALIAS[head!] ?? head!, ...rest].join('/')
}

const INVENTORY: string[] = JSON.parse(
  readFileSync(new URL('../admin-routes.json', import.meta.url), 'utf8')
)

await mockSessions()
const { default: app } = await import('#app')

const EXCLUDED = new Set(['/api/purchase_orders/purge_cancelled'])

const routes = adminRoutes.filter(
  (r): r is Route & { url: string } => r.url !== null && !EXCLUDED.has(r.url)
)

type UserRow = { id: string; name: string | null; email: string | null }

let customer: UserRow

beforeAll(async () => {
  customer = TEST_CUSTOMER

  assert.ok(
    routes.length >= 50,
    `only ${routes.length} admin routes resolved - the scanner is not working`
  )
})

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const send = (verb: string, url: string) => {
  const req = request(app)
  switch (verb.toUpperCase()) {
    case 'GET':
      return req.get(url).send({})
    case 'POST':
      return req.post(url).send({})
    case 'PUT':
      return req.put(url).send({})
    case 'PATCH':
      return req.patch(url).send({})
    case 'DELETE':
      return req.delete(url).send({})
    default:
      throw new Error(`admin-routes.test.ts cannot drive a ${verb} route (${url})`)
  }
}

function controllerFor(r: Route): string | null {
  const read = (rel: string): string | null => {
    for (const ext of ['ts', 'js']) {
      try {
        return readFileSync(path.join(SRC, `${rel.replace(/\.(ts|js)$/, '')}.${ext}`), 'utf8')
      } catch {}
    }
    return null
  }

  let routes = null
  try {
    routes = readFileSync(path.join(SRC, r.file), 'utf8')
  } catch {
    routes = null
  }
  if (routes) {
    const re = /import\s*\{([^}]*)\}\s*from\s*["']#([^"']+)["']/g
    let m
    while ((m = re.exec(routes)) !== null) {
      const named = m[1].split(',').map((n) =>
        n
          .trim()
          .split(/\s+as\s+/)[0]
          .trim()
      )
      if (!named.includes(r.handler)) continue
      const src = read(aliasPath(m[2]))
      if (src !== null) return src
    }
  }
  return read(r.file.replace(/routes\.(js|ts)$/, 'controller'))
}

test('every admin route refuses a signed-in customer', async () => {
  const reached: string[] = []
  await inPinnedTransaction(
    async () => {
      await as({ ...customer, role: 'user' }, async () => {
        for (const r of routes) {
          const res = await send(r.verb, r.url)
          if (![401, 403].includes(res.status)) reached.push(`${r.verb} ${r.url} -> ${res.status}`)
        }
      })
    },
    { actor: TEST_ACTOR.id }
  )
  assert.deepEqual(reached, [], `a customer was not refused by ${reached.length} route(s)`)
})

test('every admin route refuses an anonymous caller', async () => {
  const reached: string[] = []
  await inPinnedTransaction(
    async () => {
      await anonymous(async () => {
        for (const r of routes) {
          const res = await send(r.verb, r.url)
          if (![401, 403].includes(res.status)) reached.push(`${r.verb} ${r.url} -> ${res.status}`)
        }
      })
    },
    { actor: TEST_ACTOR.id }
  )
  assert.deepEqual(reached, [], `an anonymous caller was not refused by ${reached.length} route(s)`)
})

test('the set of admin-guarded routes is the one that was reviewed', () => {
  const current = adminRoutes.map((r) => `${r.verb} ${r.url}`).sort()

  const lost = INVENTORY.filter((r) => !current.includes(r))
  const added = current.filter((r) => !INVENTORY.includes(r))

  assert.deepEqual(
    lost,
    [],
    `${lost.length} route(s) no longer carry requireAdmin - if that is deliberate, update admin-routes.json in the same change`
  )
  assert.deepEqual(
    added,
    [],
    `${added.length} new admin route(s) - add them to admin-routes.json so the sweep covers them`
  )
})

test('no requireUser handler takes a user_id from the request without an admin check', () => {
  const offenders = []
  const unresolved = []

  for (const r of allRoutes) {
    const isUserOnly =
      r.guards.some((g) => /requireUser/.test(g)) && !r.guards.some((g) => /requireAdmin/.test(g))
    if (!isUserOnly) continue

    const src = controllerFor(r)
    if (src === null) {
      unresolved.push(`${r.verb} ${r.url} (no controller file)`)
      continue
    }

    const start = src.indexOf(`export const ${r.handler}`)
    if (start < 0) {
      unresolved.push(`${r.verb} ${r.url} (${r.handler} not exported)`)
      continue
    }
    const next = src.indexOf('\nexport const', start + 1)
    const body = src.slice(start, next < 0 ? src.length : next).replace(/\/\/[^\n]*/g, '')

    const readsFromRequest =
      /req\.(body|query)(\?)?\.user_id/.test(body) ||
      /\{[^}]*\buser_id\b[^}]*\}\s*=\s*req\.(body|query)/.test(body)
    const checksAdmin = /req\.user(\?)?\.role/.test(body)

    if (readsFromRequest && !checksAdmin) offenders.push(`${r.verb} ${r.url}`)
  }

  assert.deepEqual(
    unresolved,
    [],
    'could not find the handler for these routes, so they went unchecked'
  )
  assert.deepEqual(
    offenders,
    [],
    `${offenders.length} route(s) take a user_id from the request behind requireUser alone`
  )
})
