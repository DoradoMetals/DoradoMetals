import { test } from 'vitest'
import assert from 'node:assert/strict'
import { NATIVE_SCHEMAS, unknownSchemas, assertSchemasComplete } from '../schemas.ts'

test('checkout is a native schema', () => {
  assert.ok(NATIVE_SCHEMAS.includes('checkout'))
})

test('exchange and auctions are not native schemas', () => {
  assert.ok(!NATIVE_SCHEMAS.includes('exchange'))
  assert.ok(!NATIVE_SCHEMAS.includes('auctions'))
})

test('unknownSchemas ignores system schemas, exchange, and every listed schema', () => {
  const present = [
    ...NATIVE_SCHEMAS,
    'exchange',
    'public',
    'information_schema',
    'pg_catalog',
    'pg_toast',
  ]
  assert.deepEqual(unknownSchemas(present), [])
})

test('unknownSchemas reports a schema the list does not know', () => {
  assert.deepEqual(unknownSchemas([...NATIVE_SCHEMAS, 'auctions']), ['auctions'])
})

test('unknownSchemas ignores a leftover scratch schema from a crashed verify run', () => {
  assert.deepEqual(unknownSchemas([...NATIVE_SCHEMAS, 'zz_genesis_orders']), [])
})

test('assertSchemasComplete resolves when the database has nothing extra', async () => {
  await assertSchemasComplete(async () => NATIVE_SCHEMAS.map((s) => ({ nspname: s })))
})

test('assertSchemasComplete rejects naming a schema the database has and the list does not', async () => {
  await assert.rejects(
    () =>
      assertSchemasComplete(async () => [
        ...NATIVE_SCHEMAS.map((s) => ({ nspname: s })),
        { nspname: 'widgets' },
      ]),
    /widgets/
  )
})
