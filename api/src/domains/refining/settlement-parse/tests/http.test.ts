import { test, afterAll, vi } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import request from 'supertest'
import pool from '#pool'
import { mockSessions, restoreSessions, as, asAdmin } from '#shared/testing/session.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aRefiningOrder, aUser, anOrder } from '#shared/testing/builders/index.ts'
import { textPdf } from '#shared/text/tests/pdf-fixture.ts'
import { SettlementParse } from '@dorado/contracts'
import type { SettlementLine } from '@dorado/contracts'

const fake = vi.hoisted(() => ({ bytes: Buffer.alloc(0) as Buffer }))

vi.mock('#documents/pdfs/serve.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('#documents/pdfs/serve.ts')>()
  return {
    ...real,
    storedBytes: (row: Parameters<typeof real.storedBytes>[0]) =>
      real.storedBytes(row, async () => fake.bytes),
  }
})

await mockSessions()
const { default: app } = await import('#app')

afterAll(async () => {
  restoreSessions()
  await pool.end()
})

const inRefining = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] })

const BOUNDARY = 'DORADO-TEST-BOUNDARY'
const upload = (bytes: Buffer): Buffer =>
  Buffer.concat([
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="settlement.pdf"\r\n` +
        `Content-Type: application/pdf\r\n\r\n`
    ),
    bytes,
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
  ])

const imported = async (refining_order_id: string, bytes: Buffer) => {
  fake.bytes = bytes
  const res = await request(app)
    .post(`/api/refining/orders/${refining_order_id}/documents/settlement`)
    .set('content-type', `multipart/form-data; boundary=${BOUNDARY}`)
    .send(upload(bytes))
  assert.equal(res.status, 201, res.text)
}

const parse = (refining_order_id: string) =>
  request(app).post(`/api/refining/orders/${refining_order_id}/settlement-lines/parse`)

test('parse suggests a lot per Elemetal line and writes nothing', async () => {
  await inRefining(async (c) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLots(3)
    const refiner = await aRefiningOrder(c, order)
    const lotIds: string[] = []

    await asAdmin(TEST_ACTOR, async () => {
      const held = await request(app).get(`/api/refining/orders/${refiner.id}/settlement-lines`)
      assert.equal(held.status, 200, held.text)
      const [first, second, third] = (held.body as SettlementLine[])
        .sort((a, b) => (a.fine_oz ?? 0) - (b.fine_oz ?? 0))
        .map((l) => l.lot_id)
      lotIds.push(first!, second!, third!)
      await c.query(`UPDATE inventory.lots SET line_reference = 'ELM-88431' WHERE id = $1`, [first])

      const missing = await parse(refiner.id)
      assert.equal(missing.status, 409, missing.text)

      await imported(
        refiner.id,
        textPdf([
          'Elemetal Refining LLC',
          'ELM-88431 · 10.0 g · 92.5% 0.297 oz',
          'ELM-88432 · 11.0 g · 92.5% 0.330 oz',
          'ELM-88433 · 200.0 g · 92.5% 5.948 oz',
          'ELM-88434 · Silver · 31.1 g · 99.9% 0.999 oz',
        ])
      )
      const res = await parse(refiner.id)
      assert.equal(res.status, 200, res.text)
      const body = SettlementParse.parse(res.body)
      assert.equal(body.format, 'elemetal')
      assert.equal(body.supported, true)
      assert.deepEqual(
        body.lines.map((l) => [l.line_reference, l.suggested_lot_id, l.status]),
        [
          ['ELM-88431', first, 'matched'],
          ['ELM-88432', second, 'matched'],
          ['ELM-88433', null, 'unmatched'],
          ['ELM-88434', null, 'extra'],
        ]
      )
      assert.deepEqual(
        body.not_on_invoice.map((l) => l.lot_id),
        [third]
      )
    })

    const { rows } = await c.query<{ line_reference: string | null }>(
      'SELECT line_reference FROM inventory.lots WHERE id = ANY($1) ORDER BY line_reference',
      [lotIds]
    )
    assert.deepEqual(
      rows.map((r) => r.line_reference),
      ['ELM-88431', null, null]
    )
  })
})

test('a settlement from another refiner answers 200 with supported false', async () => {
  await inRefining(async (c) => {
    const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLots(1)
    const refiner = await aRefiningOrder(c, order)
    await asAdmin(TEST_ACTOR, async () => {
      await imported(refiner.id, textPdf(['Acme Assay Co', 'Lot 77 · 12.0 g · 58.5%']))
      const res = await parse(refiner.id)
      assert.equal(res.status, 200, res.text)
      assert.deepEqual(res.body, { format: null, supported: false, lines: [], not_on_invoice: [] })
    })
  })
})

test('parse is admin-only', async () => {
  await inRefining(async (c) => {
    const customer = await aUser(c)
    const order = await anOrder(c, customer, { direction: 'purchase' }).withLots(1)
    const refiner = await aRefiningOrder(c, order)
    await as({ ...customer, role: 'user' }, async () => {
      const res = await parse(refiner.id)
      assert.equal(res.status, 403, res.text)
    })
  })
})
