// THE LOOKUPS THE LEAD SCREENS OFFER: the Source select, the Add item drawer's
// kind, unit and purity, and the contact preference.
//
//   GET /api/leads/sources               LeadLookup[]        leads.sources
//   GET /api/leads/estimate-kinds        LeadLookup[]        leads.estimate_kinds
//   GET /api/leads/contact-preferences   LeadLookup[]        leads.contact_preferences
//   GET /api/leads/weight-units          WeightUnitLookup[]  leads.weight_units (+ grams)
//   GET /api/leads/purities              PurityLookup[]      metals.purity_labels
//
// Each answers the seeded rows ordered by sort_order. The expected rows are
// read from the table in the same transaction, so a seed change moves both.
//
// ROUTE ORDER: every path here would otherwise match `GET /api/leads/:id`
// and answer 400 or 404 for "sources". The lookup router is mounted ahead
// of leadRoutes in app.ts, as the funnel router already is.
//
// metals.purity_labels has no `key` column: a purity is (metal_id, label,
// purity), and purity is the fine fraction (14K -> 0.5833).
import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { LeadDocumentKind, LeadLookup, PurityLookup, WeightUnitLookup } from '@dorado/contracts'
import { mockSessions, restoreSessions, as, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR, TEST_CUSTOMER } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const inLeads = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id })

const KEYED: [string, string][] = [
  ['/api/leads/sources', 'leads.sources'],
  ['/api/leads/estimate-kinds', 'leads.estimate_kinds'],
  ['/api/leads/contact-preferences', 'leads.contact_preferences'],
]

for (const [path, table] of KEYED) {
  test(`${path} answers ${table} in sort_order with id, key and label`, async () => {
    await inLeads(async (c) => {
      const { rows: expected } = await c.query<{
        id: string
        key: string
        label: string
        sort_order: number
      }>(`SELECT id, key, label, sort_order FROM ${table} ORDER BY sort_order, key`)
      assert.ok(expected.length > 0, `${table} is not seeded`)

      await asAdmin(TEST_ACTOR, async () => {
        const res = await request(app).get(path)
        assert.equal(res.status, 200, res.text)
        const rows = res.body.map((r: unknown) => LeadLookup.parse(r))
        assert.deepEqual(
          rows.map((r: LeadLookup) => [r.id, r.key, r.label, r.sort_order]),
          expected.map((r) => [r.id, r.key, r.label, r.sort_order])
        )
      })
    })
  })
}

test('/api/leads/sources holds the five seeded sources, Sell form first', async () => {
  await inLeads(async () => {
    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app).get('/api/leads/sources')
      assert.equal(res.status, 200, res.text)
      assert.deepEqual(
        res.body.map((r: LeadLookup) => r.key),
        ['sell_form', 'trade_referral', 'customer_referral', 'self_created', 'walk_in']
      )
      assert.equal(res.body[0].label, 'Sell form')
    })
  })
})

test('/api/leads/weight-units answers leads.weight_units in sort_order, each with grams', async () => {
  await inLeads(async (c) => {
    const { rows: expected } = await c.query<{ id: string; key: string; grams: number }>(
      'SELECT id, key, label, grams, sort_order FROM leads.weight_units ORDER BY sort_order, key'
    )
    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app).get('/api/leads/weight-units')
      assert.equal(res.status, 200, res.text)
      const rows = res.body.map((r: unknown) => WeightUnitLookup.parse(r))
      assert.deepEqual(
        rows.map((r: WeightUnitLookup) => [r.id, r.key, r.grams]),
        expected.map((r) => [r.id, r.key, Number(r.grams)])
      )
      const troy = rows.find((r: WeightUnitLookup) => r.key === 'troy_oz')
      assert.equal(troy?.grams, 31.1034768, 'grams arrived as something other than a number')
      assert.equal(typeof troy?.label, 'string')
      assert.deepEqual(
        Object.fromEntries(rows.map((r: WeightUnitLookup) => [r.key, r.label])),
        { troy_oz: 'Troy Oz', g: 'Grams', dwt: 'DWT', lb: 'LBs' },
        'migration 303 gives the units the design labels'
      )
    })
  })
})

test('/api/leads/purities answers every purity label with its fine fraction, by metal then sort_order', async () => {
  await inLeads(async (c) => {
    const { rows: expected } = await c.query<{ id: string; metal_id: string; label: string }>(
      `SELECT id, metal_id, label, purity, sort_order
         FROM metals.purity_labels ORDER BY metal_id, sort_order, label`
    )
    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app).get('/api/leads/purities')
      assert.equal(res.status, 200, res.text)
      const rows = res.body.map((r: unknown) => PurityLookup.parse(r))
      assert.deepEqual(
        rows.map((r: PurityLookup) => [r.id, r.metal_id, r.label]),
        expected.map((r) => [r.id, r.metal_id, r.label])
      )
      const k14 = rows.find((r: PurityLookup) => r.metal_id === 'Gold' && r.label === '14K')
      assert.equal(k14?.purity, 0.5833, 'the fine fraction is missing or not a number')
      const sterling = rows.find(
        (r: PurityLookup) => r.metal_id === 'Silver' && r.label === 'Sterling'
      )
      assert.equal(sterling?.purity, 0.925)
    })
  })
})

test('a lookup path is never read as a lead id', async () => {
  await inLeads(async () => {
    await asAdmin(TEST_ACTOR, async () => {
      for (const path of [
        '/api/leads/sources',
        '/api/leads/estimate-kinds',
        '/api/leads/weight-units',
        '/api/leads/contact-preferences',
        '/api/leads/purities',
      ]) {
        const res = await request(app).get(path)
        assert.equal(res.status, 200, `${path} answered ${res.status}: ${res.text}`)
        assert.ok(Array.isArray(res.body), `${path} did not answer a list`)
      }
    })
  })
})

test('the lookups are staff-only', async () => {
  await inLeads(async () => {
    await as({ ...TEST_CUSTOMER, role: 'user' }, async () => {
      for (const path of ['/api/leads/sources', '/api/leads/purities']) {
        assert.equal((await request(app).get(path)).status, 403, path)
      }
    })
  })
})

test('/api/leads/document-kinds answers the named document kinds with the names the list uses', async () => {
  await inLeads(async () => {
    await asAdmin(TEST_ACTOR, async () => {
      const res = await request(app).get('/api/leads/document-kinds')
      assert.equal(res.status, 200, res.text)
      const rows = res.body.map((r: unknown) => LeadDocumentKind.parse(r))
      assert.deepEqual(rows, [{ kind: 'rate_sheet', name: 'Rates Sheet' }])
    })
  })
})
