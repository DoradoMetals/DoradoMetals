import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import { randomUUID } from 'node:crypto'
import pool from '#pool'
import { serveOrderDocument } from '#documents/pdfs/serve.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { aUser, anOrder, aProduct } from '#shared/testing/builders/index.ts'

afterAll(async () => {
  await pool.end()
})

const RENDERED = Buffer.from('%PDF-1.4 a fresh render of the request body')

const renderer = () => {
  const calls: number[] = []
  return {
    calls,
    render: async () => {
      calls.push(1)
      return RENDERED
    },
  }
}

async function anOwnedOrder(c: PoolClient, finalized: boolean) {
  const user = await aUser(c, { name: 'Serve Owner' })
  const product = await aProduct(c)
  let plan = anOrder(c, user, { direction: 'purchase' }).withBullion(product, 1)
  if (finalized) plan = plan.withSpots().withTotals({ total: 5200, shipping: 24.5, items: 5000 })
  const order = await plan
  if (finalized) {
    await c.query('UPDATE orders.orders SET spots_locked = true WHERE id = $1', [order.id])
  }
  return { order, owner: { id: user.id, role: 'user' } }
}

const pdfRowCount = async (c: PoolClient, order_id: string) => {
  const { rows } = await c.query('SELECT count(*)::int AS n FROM media.pdfs WHERE order_id = $1', [
    order_id,
  ])
  return rows[0].n as number
}

test('every download renders fresh and nothing is persisted by downloading', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { order, owner } = await anOwnedOrder(c, true)
      const r = renderer()
      const input = {
        kind: 'invoice' as const,
        order_id: order.id,
        caller: owner,
        render: r.render,
      }

      const first = await serveOrderDocument(input, c)
      const second = await serveOrderDocument(input, c)

      assert.deepEqual(Buffer.from(first.bytes), RENDERED)
      assert.deepEqual(Buffer.from(second.bytes), RENDERED)
      assert.equal(r.calls.length, 2, 'the second download was served from a stored copy')
      assert.equal(await pdfRowCount(c, order.id), 0, 'a download entered the paper trail')
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS] }
  )
})

test('a stored copy never shadows a fresh render', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { order, owner } = await anOwnedOrder(c, true)
      await c.query(
        `INSERT INTO media.pdfs (kind, order_id, path, size_bytes, checksum)
       VALUES ('invoice', $1, 'pdfs/x/old.pdf', 5, 'abc')`,
        [order.id]
      )
      const r = renderer()
      const served = await serveOrderDocument(
        { kind: 'invoice', order_id: order.id, caller: owner, render: r.render },
        c
      )
      assert.deepEqual(Buffer.from(served.bytes), RENDERED)
      assert.equal(r.calls.length, 1)
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS] }
  )
})

test('an invoice that is not available is refused before anything is rendered', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { order, owner } = await anOwnedOrder(c, false)
      const r = renderer()
      await assert.rejects(
        () =>
          serveOrderDocument(
            { kind: 'invoice', order_id: order.id, caller: owner, render: r.render },
            c
          ),
        /not available yet/
      )
      assert.equal(r.calls.length, 0)
      assert.equal(await pdfRowCount(c, order.id), 0)
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS] }
  )
})

test('a caller who does not own the order is refused - nothing is rendered', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { order } = await anOwnedOrder(c, true)
      const r = renderer()
      await assert.rejects(
        () =>
          serveOrderDocument(
            {
              kind: 'invoice',
              order_id: order.id,
              caller: { id: randomUUID(), role: 'user' },
              render: r.render,
            },
            c
          ),
        (e: Error & { kind?: string }) => e.kind === 'not_found'
      )
      assert.equal(r.calls.length, 0)
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS] }
  )
})

test('an anonymous caller is refused, and an admin is not', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { order } = await anOwnedOrder(c, true)
      const anonymous = renderer()
      await assert.rejects(
        () =>
          serveOrderDocument(
            { kind: 'invoice', order_id: order.id, caller: null, render: anonymous.render },
            c
          ),
        /no order/
      )
      assert.equal(anonymous.calls.length, 0)

      const admin = renderer()
      await serveOrderDocument(
        {
          kind: 'invoice',
          order_id: order.id,
          caller: { id: randomUUID(), role: 'admin' },
          render: admin.render,
        },
        c
      )
      assert.equal(admin.calls.length, 1)
    },
    { actor: TEST_ACTOR.id, lock: [LOCKS.FULFILLMENTS, LOCKS.ORDERS, LOCKS.ADDRESSES, LOCKS.USERS] }
  )
})
