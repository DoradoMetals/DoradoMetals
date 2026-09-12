import { test, afterAll, beforeAll, describe } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import fs from 'node:fs'
import path from 'node:path'
import pool from '#pool'
import { PROVIDERS } from '#logistics/shipping/operations/registry.ts'
import { BUILDERS } from '#logistics/shipping/operations/builders.ts'
import { resolveCarrier } from '#logistics/shipping/operations/resolver.ts'
import { FEDEX_CARRIER_ID } from '#providers/carriers/fedex/constants.ts'
import * as carriers from '#logistics/shipping/carriers/service.ts'

let client: PoolClient

beforeAll(async () => {
  client = await pool.connect()
})

afterAll(async () => {
  client.release()
  await pool.end()
})

const normalize = (name: unknown): string =>
  String(name || '')
    .trim()
    .toLowerCase()

describe('the carrier name every provider lookup depends on', () => {
  test('FEDEX_CARRIER_ID names FedEx in the schema the resolver reads', async () => {
    const carrier = await carriers.getCarrierById(FEDEX_CARRIER_ID, client)
    assert.ok(carrier, 'FEDEX_CARRIER_ID resolves to no carrier at all')
    assert.equal(
      normalize(carrier.organization?.name),
      'fedex',
      `the name is "${carrier.organization?.name}"`
    )

    const { rows } = await client.query('SELECT name FROM exchange.carriers WHERE id = $1', [
      FEDEX_CARRIER_ID,
    ])
    assert.equal(normalize(rows[0]?.name), 'fedex', `exchange calls it "${rows[0]?.name}"`)
  })

  test('exchange holds the same name for every carrier the new schema serves', async () => {
    const { rows: fromExchange } = await client.query('SELECT id, name FROM exchange.carriers')
    assert.ok(fromExchange.length > 0, 'dev has no carriers to compare')
    const fromNext = await carriers.getAllCarriers()

    for (const carrier of fromExchange) {
      const counterpart = fromNext.find((c) => c.id === carrier.id)
      assert.ok(counterpart, `${carrier.name} is missing from the new schema`)
      assert.equal(
        counterpart.organization?.name,
        carrier.name,
        `carrier ${carrier.id} is "${carrier.name}" in exchange and ` +
          `"${counterpart.organization?.name}" in the new schema`
      )
    }
  })

  test('every carrier either resolves to a provider or is one we have not built', async () => {
    const unimplemented = new Set(['ups', 'usps'])
    const all = await carriers.getAllCarriers()
    assert.ok(all.length, 'no carriers, so this test asserts nothing')
    for (const carrier of all) {
      const name = carrier.organization?.name
      const code = normalize(name)
      if (unimplemented.has(code)) continue
      assert.ok(
        (PROVIDERS as Record<string, unknown>)[code],
        `carrier "${name}" has no provider registered`
      )
      assert.ok(
        (BUILDERS as Record<string, unknown>)[code],
        `carrier "${name}" has no builders registered`
      )
    }
  })
})

describe('resolveCarrier', () => {
  test('resolves FedEx to a provider and a full set of builders', async () => {
    const { code, provider, builders } = await resolveCarrier(FEDEX_CARRIER_ID, client)
    assert.equal(code, 'fedex')
    assert.ok(provider)
    for (const op of [
      'validateAddress',
      'getRates',
      'createLabel',
      'cancelLabel',
      'checkPickup',
      'createPickup',
      'cancelPickup',
      'getTracking',
      'getLocations',
    ]) {
      assert.equal(
        typeof (builders as Record<string, unknown>)[op],
        'function',
        `no builder for ${op}`
      )
    }
  })

  test('an unknown carrier id throws a message that says what went wrong', async () => {
    await assert.rejects(
      () => resolveCarrier('00000000-0000-4000-8000-000000000000', client),
      /Unsupported carrier/
    )
  })
})

describe('every registered provider is usable', () => {
  test('PROVIDERS and BUILDERS cover the same carriers', () => {
    assert.deepEqual(Object.keys(PROVIDERS).sort(), Object.keys(BUILDERS).sort())
  })
})

describe('the handler dispatches only methods its providers have', () => {
  const readHandler = () => {
    for (const name of ['handler.ts', 'handler.js']) {
      const full = path.join(import.meta.dirname, '..', name)
      if (fs.existsSync(full)) return fs.readFileSync(full, 'utf8')
    }
    throw new Error(
      'no handler.ts or handler.js beside this test - if the handler moved, ' +
        'this check has lost its subject and must be pointed at the new one'
    )
  }

  const dispatched = (object: string): string[] =>
    [...readHandler().matchAll(new RegExp(`\\b${object}\\.([A-Za-z0-9_]+)\\(`, 'g'))].map(
      (m) => m[1]
    )

  test('the dispatch lines were found at all', () => {
    assert.ok(dispatched('provider').length >= 9, 'found no provider dispatch lines to check')
    assert.ok(dispatched('builders').length >= 9, 'found no builder dispatch lines to check')
  })

  test('every provider implements every method the handler calls', () => {
    for (const [name, provider] of Object.entries(PROVIDERS)) {
      for (const method of dispatched('provider')) {
        assert.equal(
          typeof (provider as Record<string, unknown>)[method],
          'function',
          `handler calls provider.${method}(), which ${name} does not export`
        )
      }
    }
  })

  test('every carrier has a builder for every method the handler calls', () => {
    for (const [name, builders] of Object.entries(BUILDERS)) {
      for (const method of dispatched('builders')) {
        assert.equal(
          typeof (builders as Record<string, unknown>)[method],
          'function',
          `handler calls builders.${method}(), which ${name} does not register`
        )
      }
    }
  })
})
