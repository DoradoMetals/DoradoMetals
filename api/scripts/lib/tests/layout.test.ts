import { test } from 'vitest'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { domainDirs, importMap, isTransportFile } from '../layout.ts'

const API = path.resolve(import.meta.dirname, '..', '..', '..')

function tree(imports: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dorado-layout-'))
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ imports }))
  return dir
}

test('domainDirs reads the wildcard roots out of package.json imports', () => {
  const root = tree({
    '#env': './env.ts',
    '#db/*': './db/*',
    '#shared/*': './shared/*',
    '#providers/*': './providers/*',
    '#orders/*': './orders/*',
    '#logistics/*': './logistics/*',
  })
  assert.deepEqual(domainDirs(root), ['logistics', 'orders'])
})

test('a new domain is one imports line and every check sees it', () => {
  const root = tree({ '#orders/*': './orders/*', '#auctions/*': './auctions/*' })
  assert.deepEqual(domainDirs(root), ['auctions', 'orders'])
})

test('db, shared and providers are layers, not domains', () => {
  const root = tree({
    '#db/*': './db/*',
    '#shared/*': './shared/*',
    '#providers/*': './providers/*',
  })
  assert.deepEqual(domainDirs(root), [])
})

test("the api's own manifest yields the nine domains of ruling 77", () => {
  assert.deepEqual(domainDirs(API), [
    'catalog',
    'checkout',
    'crm',
    'identity',
    'logistics',
    'media',
    'orders',
    'payments',
    'pricing',
  ])
})

test('every domain dir named by the manifest exists on disk', () => {
  for (const dir of domainDirs(API)) assert.ok(fs.existsSync(path.join(API, dir)), dir)
})

test('importMap carries the exact specifiers alongside the wildcards', () => {
  const map = importMap(API)
  assert.equal(map['#domains'], './domains.ts')
  assert.equal(map['#db'], './db/index.ts')
})

test('isTransportFile is the role the transport folder used to encode', () => {
  assert.ok(isTransportFile('orders/routes.ts'))
  assert.ok(isTransportFile('orders/creates.routes.ts'))
  assert.ok(isTransportFile('checkout/checkout.routes.ts'))
  assert.ok(isTransportFile('orders/controller.ts'))
  assert.ok(isTransportFile('logistics/fulfillments/methods/controller.ts'))
})

test('a service, a rules file and a test are not transport', () => {
  assert.ok(!isTransportFile('orders/service.ts'))
  assert.ok(!isTransportFile('orders/rules.ts'))
  assert.ok(!isTransportFile('logistics/fulfillments/owner.ts'))
  assert.ok(!isTransportFile('orders/tests/routes.test.ts'))
})
