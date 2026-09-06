import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import express from 'express'
import pool from '#pool'

const MOUNTS = new WeakMap<object, string>()
{
  const proto =
    (express.Router as unknown as { prototype?: Record<string, unknown> }).prototype ??
    Object.getPrototypeOf(express.Router())
  const target = proto as { use: (...args: unknown[]) => unknown }
  const origUse = target.use
  target.use = function (...args: unknown[]) {
    if (typeof args[0] === 'string') {
      for (const h of (args.slice(1) as unknown[]).flat(Infinity)) {
        if (typeof h === 'function') MOUNTS.set(h as object, args[0] as string)
      }
    }
    return origUse.apply(this, args)
  }
}
const { default: app } = await import('#app')

const PUBLIC = new Set([
  'GET /api/products/',
  'GET /api/products/:slug',
  'GET /api/rates/',
  'GET /api/rates/tiers',
  'GET /api/reviews/public',
  'GET /api/spots/',
  'POST /api/recaptcha/verify-recaptcha',
  'POST /api/quotes/catalog',
  'GET /api/payments/methods/',
  'GET /api/carrier_services/sale_options',
])

const NOT_OURS = new Set(['POST /api/auth/stripe/webhook', 'ALL /api/auth/*splat'])

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
      throw new Error(`endpoints.test.ts cannot drive a ${verb} endpoint (${url})`)
  }
}

type Endpoint = {
  method: string
  path: string
  key: string
  guarded: boolean
  hasMiddleware: boolean
}

type Matcher = (url: string) => false | { path: string }
type Layer = {
  route?: { path: string | string[]; methods: Record<string, boolean>; stack: unknown[] }
  name?: string
  handle?: { stack?: Layer[] }
  matchers?: Matcher[]
}

function inventory(): Endpoint[] {
  const found: Endpoint[] = []
  const walk = (stack: Layer[], prefix: string): void => {
    for (const layer of stack) {
      if (layer.route) {
        const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path]
        const names = Object.keys(layer.route.methods)
        const methods =
          layer.route.methods._all || names.length > 10
            ? ['ALL']
            : names.map((m) => m.toUpperCase())
        for (const routePath of paths) {
          for (const method of methods) {
            const key = `${method} ${prefix + routePath}`
            found.push({
              method,
              path: prefix + routePath,
              key,
              guarded: !PUBLIC.has(key) && !NOT_OURS.has(key),
              hasMiddleware: layer.route.stack.length > 1,
            })
          }
        }
      } else if (layer.name === 'router' && layer.handle?.stack) {
        const mount = MOUNTS.get(layer.handle)
        assert.ok(
          mount !== undefined,
          'a mounted router was never seen by the recording use() - the walk is broken'
        )
        walk(layer.handle.stack, prefix + (mount === '/' ? '' : mount))
      }
    }
  }
  const holder = app as unknown as { router?: { stack?: Layer[] }; _router?: { stack?: Layer[] } }
  const router = holder.router ?? holder._router
  assert.ok(router?.stack, 'could not read the express router stack - the walk is broken')
  walk(router.stack, '')
  return found
}

const endpoints = inventory()

afterAll(async () => {
  await pool.end()
})

beforeAll(() => {
  assert.ok(endpoints.length > 100, `only ${endpoints.length} endpoints found - the walk is wrong`)
})

test('every endpoint is either guarded or deliberately public', () => {
  const unguarded = endpoints
    .filter((e) => !e.hasMiddleware && !PUBLIC.has(e.key) && !NOT_OURS.has(e.key))
    .map((e) => e.key)

  assert.deepEqual(
    unguarded,
    [],
    'these endpoints have no middleware and are not on the public list - ' +
      'either add the guard or add them to PUBLIC with a reason'
  )
})

test('the public list has no entries that are not routes', () => {
  const keys = new Set(endpoints.map((e) => e.key))
  const stale = [...PUBLIC, ...NOT_OURS].filter((k) => !keys.has(k))
  assert.deepEqual(stale, [], 'PUBLIC/NOT_OURS names endpoints that no longer exist')
})

test('no guarded endpoint answers an anonymous request', async () => {
  const guarded = endpoints.filter((e) => e.guarded)
  assert.ok(guarded.length > 90, `only ${guarded.length} guarded endpoints to check`)

  const served: string[] = []
  for (const e of guarded) {
    const res = await send(e.method, e.path)
    if (res.status !== 401 && res.status !== 403) {
      served.push(`${e.key} -> ${res.status}`)
    }
  }
  assert.deepEqual(served, [], 'these answered a request with no session')
})

test('an unknown route returns JSON, not an HTML error page', async () => {
  const res = await request(app).get('/api/definitely-not-a-route')
  assert.equal(res.status, 404)
  assert.deepEqual(res.body, { error: 'Not Found' })
})

test('public reads return JSON', async () => {
  const reads: [path: string, mustHaveRows: boolean][] = [
    ['/api/products', true],
    ['/api/spots', true],
    ['/api/rates', true],
    ['/api/rates/tiers', true],
    ['/api/reviews/public', false],
  ]

  for (const [path, mustHaveRows] of reads) {
    const res = await request(app).get(path)
    assert.equal(res.status, 200, `${path} returned ${res.status}`)
    assert.ok(Array.isArray(res.body), `${path} did not return an array`)
    if (mustHaveRows) {
      assert.ok(res.body.length > 0, `${path} returned an empty array - dev has rows for this`)
    }
  }
})

import fs from 'node:fs'
import path from 'node:path'
import { domainDirs, sourceRoot } from '../../../../scripts/lib/layout.ts'

const API_ROOT = path.join(import.meta.dirname, '..', '..', '..', '..')
const API = sourceRoot(API_ROOT)
const FEATURE_DIRS = domainDirs(API_ROOT).map((d) => path.join(API, d))
// A URL whose first segment IS a domain resolves under the domains root too.
const BASES = [...new Set([API, ...FEATURE_DIRS.map((d) => path.dirname(d)), ...FEATURE_DIRS])]

const UNROUTED = {
  'domains/transactions/controller.ts': {
    handleStripeWebhook: 'mounted directly on the app in app.ts, before express.json',
  },
  'domains/documents/emails/controller.ts': {},
} satisfies Record<string, Record<string, string>> as Record<
  string,
  Record<string, string> | undefined
>

const controllers = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) controllers(full, out)
    else if (e.name === 'controller.js' || e.name === 'controller.ts') out.push(full)
  }
  return out
}

const routeFiles = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) routeFiles(full, out)
    else if (/(^|\.)routes\.(js|ts)$/.test(e.name)) out.push(full)
  }
  return out
}

const exportedHandlers = (src: string): Set<string> => {
  const names = new Set<string>()
  for (const m of src.matchAll(/export\s+const\s+([A-Za-z0-9_]+)\s*=\s*asyncHandler/g)) {
    names.add(m[1])
  }
  return names
}

test('every exported controller handler is routed, or declared unrouted', () => {
  const orphans = []
  const stale = []
  const allRoutes = FEATURE_DIRS.flatMap((d) => routeFiles(d)).map((f) =>
    fs.readFileSync(f, 'utf8')
  )
  assert.ok(
    allRoutes.length > 10,
    `only ${allRoutes.length} routes file(s) found - the walk is wrong`
  )

  for (const file of FEATURE_DIRS.flatMap((d) => controllers(d))) {
    const rel = path.relative(API, file)
    const src = fs.readFileSync(file, 'utf8')
    const declared = UNROUTED[rel] ?? {}

    for (const name of exportedHandlers(src)) {
      const routed = allRoutes.some((r) => new RegExp(`\\b${name}\\b`).test(r))
      if (!routed && !declared[name]) orphans.push(`${rel}: ${name}`)
    }

    for (const name of Object.keys(declared)) {
      if (!exportedHandlers(src).has(name)) stale.push(`${rel}: ${name}`)
    }
  }

  assert.deepEqual(
    orphans,
    [],
    'these handlers are exported and never routed - wire them or add them to ' +
      'UNROUTED with the reason'
  )
  assert.deepEqual(stale, [], 'UNROUTED names handlers that no longer exist')
})

test('the unrouted check can actually fail', () => {
  const handlers = exportedHandlers(`
    export const wired = asyncHandler(async () => {});
    export const orphaned = asyncHandler(async () => {});
  `)
  assert.deepEqual([...handlers].sort(), ['orphaned', 'wired'])

  const routes = ['router.get("/x", wired);']
  const unrouted = [...handlers].filter(
    (name) => !routes.some((r) => new RegExp(`\\b${name}\\b`).test(r))
  )
  assert.deepEqual(unrouted, ['orphaned'], 'an unrouted handler was not spotted')

  const elsewhere = ['router.get("/y", orphaned);']
  const stillUnrouted = [...handlers].filter(
    (name) => ![...routes, ...elsewhere].some((r) => new RegExp(`\\b${name}\\b`).test(r))
  )
  assert.deepEqual(stillUnrouted, [], 'a handler routed from another feature was called an orphan')
})

test('no public endpoint reads a user id from the request', () => {
  const handlerFor = (key: string): { name: string; dir: string } | null => {
    const [method, full] = key.split(' ')
    const tail = full.replace(/^\/api\/[^/]+/, '')
    if (tail !== '/')
      for (const file of FEATURE_DIRS.flatMap((d) => routeFiles(d))) {
        const src = fs.readFileSync(file, 'utf8')
        const line = src
          .split('\n')
          .find(
            (l) =>
              l.includes(`router.${method.toLowerCase()}(`) &&
              (l.includes(`"${tail}"`) || l.includes(`'${tail}'`))
          )
        if (!line) continue
        const name = line.match(/,\s*([A-Za-z0-9_]+)\s*\)\s*;?\s*$/)?.[1]
        if (name) return { name, dir: path.dirname(file) }
      }
    const segments = full
      .replace(/^\/api\//, '')
      .split('/')
      .filter(Boolean)
    // The URL's first segment is a MOUNT name (ruling 13 pins it); the folder
    // it lives in is the domain's, which need not share that name.
    const candidates = segments.length > 1 ? [segments, segments.slice(1)] : [segments]
    for (const base of BASES)
      for (const segs of candidates) {
        const dir = path.join(base, ...segs)
        const file = path.join(dir, 'routes.ts')
        if (!fs.existsSync(file)) continue
        const src = fs.readFileSync(file, 'utf8')
        const line = src
          .split('\n')
          .find(
            (l) =>
              l.includes(`router.${method.toLowerCase()}(`) &&
              (l.includes(`"/"`) || l.includes(`'/'`))
          )
        const name = line?.match(/,\s*([A-Za-z0-9_]+)\s*\)\s*;?\s*$/)?.[1]
        if (name) return { name, dir }
      }
    return null
  }

  const bodyOf = (dir: string, name: string): string | null => {
    const file = [path.join(dir, 'controller.ts'), path.join(dir, 'controller.js')].find((f) =>
      fs.existsSync(f)
    )
    if (!file) return null
    const src = fs.readFileSync(file, 'utf8')
    const start = src.indexOf(`export const ${name} =`)
    if (start === -1) return null
    const next = src.indexOf('\nexport const ', start + 1)
    return src.slice(start, next === -1 ? undefined : next)
  }

  const offenders = []
  const unresolved = []

  for (const key of PUBLIC) {
    const found = handlerFor(key)
    if (!found) {
      unresolved.push(key)
      continue
    }
    const body = bodyOf(found.dir, found.name)
    if (body === null) {
      unresolved.push(`${key} (${found.name})`)
      continue
    }
    if (/\buser_id\b|\buserId\b/.test(body)) {
      offenders.push(`${key} -> ${found.name}`)
    }
  }

  assert.deepEqual(
    unresolved,
    [],
    'could not find the handler for these public routes, so they went unchecked'
  )

  assert.deepEqual(
    offenders,
    [],
    'these answer anonymous callers AND take a user id from the request - there ' +
      'is no session to check it against, so it can only be obeyed'
  )
})
