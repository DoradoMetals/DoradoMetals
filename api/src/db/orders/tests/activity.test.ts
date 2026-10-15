import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import * as orders from '#db/orders/repo.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { aRefiningOrder, aUser, anOrder } from '#shared/testing/builders/index.ts'
import { OrderActivity } from '@dorado/contracts'

afterAll(async () => {
  await pool.end()
})

const inOrders = <T>(fn: (c: PoolClient) => Promise<T>) =>
  inPinnedTransaction(fn, { actor: TEST_ACTOR.id, lock: [LOCKS.ORDERS, LOCKS.FULFILLMENTS] })

const PAGE = { limit: 100 }

async function aStoryOf(c: PoolClient) {
  const order = await anOrder(c, await aUser(c), { direction: 'purchase' }).withLots(1)
  await c.query(
    `UPDATE orders.orders SET created_at = '2026-01-01T10:00:00Z', updated_at = '2026-01-01T10:00:00Z'
      WHERE id = $1`,
    [order.id]
  )
  const lock = await c.query<{ id: string }>(
    `INSERT INTO orders.spot_locks (order_id, metal_id, action, bid, ask, created_at)
     VALUES ($1, 'Gold', 'lock', 100, 110, '2026-01-02T10:00:00Z') RETURNING id`,
    [order.id]
  )
  const transfer = await c.query<{ id: string }>(
    `INSERT INTO payments.transfers (order_id, kind, rail, state, amount, sent_at, created_at,
                                     override_reason)
     VALUES ($1, 'payout', 'ACH', 'Sent', 10, '2026-01-04T10:00:00Z', '2026-01-03T10:00:00Z',
             'second payout, approved')
     RETURNING id`,
    [order.id]
  )
  await c.query(
    `INSERT INTO payments.transfer_events (transfer_id, provider, event_id, event_type,
                                           reported_state, occurred_at)
     VALUES ($1, 'moov', 'evt-activity', 'transfer.updated', 'Sent', '2026-01-05T10:00:00Z')`,
    [transfer.rows[0]!.id]
  )
  const pdf = await c.query<{ id: string }>(
    `INSERT INTO media.pdfs (kind, order_id, path, size_bytes, created_at)
     VALUES ('invoice', $1, 'pdfs/activity/invoice.pdf', 31000, '2026-01-06T10:00:00Z')
     RETURNING id`,
    [order.id]
  )
  await c.query(
    `INSERT INTO media.emails (kind, status, to_address, order_id, pdf_id, sent_at)
     VALUES ('document_sent', 'sent', 'zz-activity@dorado.test', $1, $2, '2026-01-07T10:00:00Z')`,
    [order.id, pdf.rows[0]!.id]
  )
  const refiner = await aRefiningOrder(c, order)
  await c.query(
    `UPDATE refining.orders SET sent_at = '2026-01-08T10:00:00Z', settled_at = '2026-01-09T10:00:00Z'
      WHERE id = $1`,
    [refiner.id]
  )
  return { order, lock: lock.rows[0]!.id, transfer: transfer.rows[0]!.id, refiner }
}

test('the activity reads every stored fact of the order, newest first, through the contract', async () => {
  await inOrders(async (c) => {
    const story = await aStoryOf(c)
    const rows = await orders.activity(story.order.id, PAGE, c)

    for (const row of rows) OrderActivity.parse(row)
    assert.deepEqual(
      rows.map((r) => r.kind),
      [
        'order_updated',
        'refiner_settled',
        'refiner_sent',
        'email_sent',
        'document_stored',
        'transfer_event',
        'transfer_sent',
        'transfer_created',
        'spots_locked',
        'order_created',
      ]
    )
    const at = rows.map((r) => r.at)
    assert.deepEqual([...at].sort().reverse(), at, 'the rows are not newest first')

    const created = rows.find((r) => r.kind === 'order_created')!
    assert.equal(created.actor_id, TEST_ACTOR.id, 'the actor is the stamped id')
    assert.equal(created.subject_id, story.order.id)

    const transfer = rows.find((r) => r.kind === 'transfer_created')!
    assert.equal(transfer.subject_id, story.transfer)
    assert.equal(transfer.detail?.override_reason, 'second payout, approved')
    assert.equal(transfer.detail?.transfer_kind, 'payout')

    assert.equal(rows.find((r) => r.kind === 'spots_locked')!.detail?.metal_id, 'Gold')
    assert.equal(rows.find((r) => r.kind === 'refiner_sent')!.subject_id, story.refiner.id)
    assert.equal(rows.find((r) => r.kind === 'email_sent')!.detail?.document_kind, 'invoice')
  })
})

test('the activity pages by limit and by a before cursor on at', async () => {
  await inOrders(async (c) => {
    const story = await aStoryOf(c)
    const first = await orders.activity(story.order.id, { limit: 3 }, c)
    assert.deepEqual(
      first.map((r) => r.kind),
      ['order_updated', 'refiner_settled', 'refiner_sent']
    )
    const next = await orders.activity(story.order.id, { limit: 2, before: first[2]!.at }, c)
    assert.deepEqual(
      next.map((r) => r.kind),
      ['email_sent', 'document_stored']
    )
  })
})

test('an order with nothing but its placement reads one row, and an unknown order reads none', async () => {
  await inOrders(async (c) => {
    const order = await anOrder(c, await aUser(c), { direction: 'sale' })
    const rows = await orders.activity(order.id, PAGE, c)
    assert.ok(rows.some((r) => r.kind === 'order_created'))
    assert.ok(rows.every((r) => r.kind !== 'refiner_sent'))
    assert.deepEqual(await orders.activity('00000000-0000-4000-8000-00000000dead', PAGE, c), [])
  })
})
