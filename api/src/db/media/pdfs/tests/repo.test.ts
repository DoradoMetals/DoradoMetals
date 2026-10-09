import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import { LOCKS, takeLocks } from '#shared/testing/locks.ts'
import { rollbackIn } from '#shared/testing/rollback.ts'
import { aUser, anOrder } from '#shared/testing/builders/index.ts'
import * as repo from '#db/media/pdfs/repo.ts'

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(),
    0,
    'these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`'
  )
})

afterAll(async () => {
  await pool.end()
})

const anOrderId = async (c: PoolClient) =>
  (await anOrder(c, await aUser(c), { direction: 'purchase' })).id

const inRollback = rollbackIn({ lock: LOCKS.ORDERS })

test('create writes a row and returns its id', async () => {
  await inRollback(async (c) => {
    const orderId = await anOrderId(c)
    const written = await repo.create(
      {
        kind: 'packing_list',
        order_id: orderId,
        refining_order_id: null,
        path: `pdfs/${orderId}/packing_list-test.pdf`,
        size_bytes: 42,
        checksum: 'deadbeef',
      },
      c
    )
    assert.ok(written.id)
  })
})

test('latestOfKind reads back a row this transaction just wrote', async () => {
  await inRollback(async (c) => {
    const orderId = await anOrderId(c)
    const written = await repo.create(
      {
        kind: 'invoice',
        order_id: orderId,
        refining_order_id: null,
        path: `pdfs/${orderId}/invoice-1.pdf`,
        size_bytes: 20,
        checksum: 'new-checksum',
      },
      c
    )

    const latest = await repo.latestOfKind('invoice', orderId, c)
    assert.equal(latest?.id, written.id)
    assert.equal(latest?.checksum, 'new-checksum')
  })
})

test('latestOfKind answers null for an order with no document at all', async () => {
  await inRollback(async (c) => {
    const latest = await repo.latestOfKind('invoice', await anOrderId(c), c)
    assert.equal(latest, null)
  })
})

const BOGUS = /\b(NaN|null|undefined|Infinity)\b/

test('assayResults reads a purchase order lot by lot, with no bogus tokens', async () => {
  await inRollback(async (c) => {
    const user = await aUser(c)
    const order = await anOrder(c, user, { direction: 'purchase' }).withLines(
      { metal_id: 'Gold', pre_melt: 10, post_melt: 9.8, purity: 0.583, unit: 'g' },
      { metal_id: 'Silver', pre_melt: 5, purity: 0.925, unit: 't oz' }
    )

    const doc = await repo.assayResults(order.id, c)
    assert.ok(doc)
    assert.ok(doc.lots.length >= 1)
    for (const lot of doc.lots) {
      assert.ok(lot.figure.length > 0)
      for (const fact of lot.facts) assert.ok(fact.length > 0)
    }
    assert.doesNotMatch(JSON.stringify(doc), BOGUS)
  })
})

test('a lot with no purity and no weight still gets a row, figure "-", no facts', async () => {
  await inRollback(async (c) => {
    const user = await aUser(c)
    const order = await anOrder(c, user, { direction: 'purchase' }).withLines({
      metal_id: 'Gold',
    })

    const doc = await repo.assayResults(order.id, c)
    assert.ok(doc)
    assert.equal(doc.lots.length, 1)
    assert.equal(doc.lots[0]?.figure, '-')
    assert.deepEqual(doc.lots[0]?.facts, [])
    assert.doesNotMatch(JSON.stringify(doc), BOGUS)
  })
})

const STANDARD_LABELS = [
  '24K',
  '22K',
  '18K',
  '14K',
  '10K',
  '.999',
  '.925',
  '.900',
  '.800',
  '.950',
  '.500',
]

test('a lot far from every standard purity for its metal gets no label fact', async () => {
  await inRollback(async (c) => {
    const user = await aUser(c)
    const order = await anOrder(c, user, { direction: 'purchase' }).withLines({
      metal_id: 'Silver',
      pre_melt: 10,
      purity: 0.059,
      unit: 'g',
    })

    const doc = await repo.assayResults(order.id, c)
    assert.ok(doc)
    assert.equal(doc.lots.length, 1)
    const facts = doc.lots[0]?.facts ?? []
    assert.ok(facts.some((f) => f.includes('% purity')))
    for (const label of STANDARD_LABELS) assert.ok(!facts.includes(label))
    assert.doesNotMatch(JSON.stringify(doc), BOGUS)
  })
})

test('by_metal values sum to total_fine', async () => {
  await inRollback(async (c) => {
    const user = await aUser(c)
    const order = await anOrder(c, user, { direction: 'purchase' }).withLines(
      { metal_id: 'Gold', content: 3 },
      { metal_id: 'Silver', content: 1.5 },
      { metal_id: 'Gold', content: 0.5 }
    )

    const doc = await repo.assayResults(order.id, c)
    assert.ok(doc)
    const sum = doc.by_metal.reduce((acc, row) => acc + Number.parseFloat(row.value), 0)
    assert.equal(sum.toFixed(3), Number.parseFloat(doc.total_fine).toFixed(3))
  })
})

test('assayResults answers null for a sale order', async () => {
  await inRollback(async (c) => {
    const user = await aUser(c)
    const order = await anOrder(c, user, { direction: 'sale' })
    const doc = await repo.assayResults(order.id, c)
    assert.equal(doc, null)
  })
})

test('rateSheet parses with a Bullion and a Scrap row per metal', async () => {
  await inRollback(async (c) => {
    const doc = await repo.rateSheet(c)
    assert.ok(doc.metals.length >= 1)
    for (const metal of doc.metals) {
      assert.deepEqual(
        metal.rows.map((r) => r.label),
        ['Bullion', 'Scrap']
      )
      for (const row of metal.rows) {
        assert.equal(row.values.length, metal.columns.length)
      }
    }
  })
})

test('the audit trigger stamps who uploaded a pdf', async () => {
  await inRollback(async (c) => {
    const orderId = await anOrderId(c)
    const actor = await aUser(c)
    await c.query(`SELECT set_config('app.actor_id', $1, true)`, [actor.id])

    const written = await repo.create(
      {
        kind: 'intake_receipt',
        order_id: orderId,
        refining_order_id: null,
        path: 'pdfs/audit-stamp-check.pdf',
        size_bytes: 10,
        checksum: 'audit-stamp-check',
      },
      c
    )
    const { rows } = await c.query<{ created_by_id: string | null }>(
      `SELECT created_by_id FROM media.pdfs WHERE id = $1`,
      [written.id]
    )
    assert.equal(
      rows[0]!.created_by_id,
      actor.id,
      'media.pdfs carried the audit trigger with nowhere for it to write'
    )
  })
})
