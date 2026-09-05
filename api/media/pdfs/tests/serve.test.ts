import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import { createHash, randomUUID } from 'node:crypto'
import pool from '#pool'
import { serveOrderDocument } from '#media/pdfs/serve.ts'
import * as orderRead from '#orders/read.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { inRollback } from '#shared/testing/rollback.ts'

let client: PoolClient
type OrderFixture = { id: string }

let order: OrderFixture
let owner: { id: string; role: string }

beforeAll(async () => {
  client = await pool.connect()
  await client.query('SELECT pg_advisory_lock($1)', [LOCKS.ORDERS])
  const orders = (await orderRead.list('purchase', null)) as unknown as OrderFixture[]
  assert.ok(orders.length > 0, 'dev has no purchase orders')

  for (const o of orders) {
    const { rows } = await client.query('SELECT user_id FROM orders.orders WHERE id = $1', [o.id])
    if (rows.length && rows[0].user_id) {
      order = o
      owner = { id: rows[0].user_id, role: 'user' }
      break
    }
  }
  assert.ok(order, 'no dev purchase order exists in orders.orders')
  assert.ok(owner.id, 'the linkable order has no user_id to own it')
})

afterAll(async () => {
  await client.query('SELECT pg_advisory_unlock($1)', [LOCKS.ORDERS])
  client.release()
  await pool.end()
})

const sha256 = (bytes: Buffer | Uint8Array | string) =>
  createHash('sha256').update(bytes).digest('hex')

const STORED = Buffer.from('%PDF-1.4 the bytes the customer was actually sent')
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

const reader = (bytes: Buffer | null) => {
  const paths: string[] = []
  return {
    paths,
    read: async (path: string) => {
      paths.push(path)
      if (bytes === null) throw new Error('NoSuchKey: object deleted out-of-band')
      return bytes
    },
  }
}

async function insertRow(
  c: PoolClient,
  { path, checksum, hoursAgo }: { path: string; checksum: string; hoursAgo: number }
) {
  await c.query(
    `INSERT INTO media.pdfs (kind, order_id, path, size_bytes, checksum, created_at)
     VALUES ('invoice', $1, $2, $3, $4, now() - make_interval(hours => $5))`,
    [order.id, path, STORED.length, checksum, hoursAgo]
  )
}

const pdfRowCount = async (c: PoolClient) => {
  const { rows } = await c.query('SELECT count(*)::int AS n FROM media.pdfs WHERE order_id = $1', [
    order.id,
  ])
  return rows[0].n
}

test('the LATEST stored row of the kind is the one served', async () => {
  await inRollback(async (c: PoolClient) => {
    await insertRow(c, { path: 'pdfs/x/old.pdf', checksum: sha256('stale'), hoursAgo: 2 })
    await insertRow(c, { path: 'pdfs/x/new.pdf', checksum: sha256(STORED), hoursAgo: 1 })

    const r = renderer()
    const storage = reader(STORED)
    const served = await serveOrderDocument(
      { kind: 'invoice', order_id: order.id, caller: owner, render: r.render },
      storage.read,
      c
    )

    assert.equal(served.source, 'stored')
    assert.deepEqual(Buffer.from(served.bytes), STORED)
    assert.deepEqual(storage.paths, ['pdfs/x/new.pdf'], "the newest row's object, nothing else")
    assert.equal(r.calls.length, 0, 'a stored document must not be re-rendered')
  })
})

test('an admin who does not own the order still gets the stored document', async () => {
  await inRollback(async (c: PoolClient) => {
    await insertRow(c, { path: 'pdfs/x/new.pdf', checksum: sha256(STORED), hoursAgo: 1 })

    const r = renderer()
    const served = await serveOrderDocument(
      {
        kind: 'invoice',
        order_id: order.id,
        caller: { id: randomUUID(), role: 'admin' },
        render: r.render,
      },
      reader(STORED).read,
      c
    )
    assert.equal(served.source, 'stored')
    assert.equal(r.calls.length, 0)
  })
})

test('no stored row: the fallback renders live AND persists, so the second download reads the store', async () => {
  await inRollback(async (c: PoolClient) => {
    assert.equal(await pdfRowCount(c), 0, 'the fixture order already has rows')

    const r = renderer()
    const storage = reader(STORED)
    const served = await serveOrderDocument(
      { kind: 'invoice', order_id: order.id, caller: owner, render: r.render },
      storage.read,
      c
    )

    assert.equal(served.source, 'rendered')
    assert.deepEqual(Buffer.from(served.bytes), RENDERED)
    assert.equal(r.calls.length, 1)
    assert.deepEqual(storage.paths, [], 'there was nothing stored to read')

    const { rows } = await c.query(
      'SELECT kind, checksum, size_bytes FROM media.pdfs WHERE order_id = $1',
      [order.id]
    )
    assert.equal(rows.length, 1, 'the fallback did not persist its render')
    assert.equal(rows[0].kind, 'invoice')
    assert.equal(rows[0].checksum, sha256(RENDERED))
    assert.equal(Number(rows[0].size_bytes), RENDERED.length)

    const second = renderer()
    const secondStorage = reader(RENDERED)
    const again = await serveOrderDocument(
      { kind: 'invoice', order_id: order.id, caller: owner, render: second.render },
      secondStorage.read,
      c
    )
    assert.equal(again.source, 'stored')
    assert.equal(second.calls.length, 0)
  })
})

test('a storage miss falls back to a live render, never a 500', async () => {
  await inRollback(async (c: PoolClient) => {
    await insertRow(c, { path: 'pdfs/x/gone.pdf', checksum: sha256(STORED), hoursAgo: 1 })

    const r = renderer()
    const served = await serveOrderDocument(
      { kind: 'invoice', order_id: order.id, caller: owner, render: r.render },
      reader(null).read,
      c
    )

    assert.equal(served.source, 'rendered', 'the download must not break over bookkeeping')
    assert.deepEqual(Buffer.from(served.bytes), RENDERED)
    assert.equal(r.calls.length, 1)
    assert.equal(await pdfRowCount(c), 1)
  })
})

test('stored bytes that no longer match their checksum are a miss, not a serve', async () => {
  await inRollback(async (c: PoolClient) => {
    await insertRow(c, {
      path: 'pdfs/x/new.pdf',
      checksum: sha256('what was really sent'),
      hoursAgo: 1,
    })

    const served = await serveOrderDocument(
      { kind: 'invoice', order_id: order.id, caller: owner, render: renderer().render },
      reader(STORED).read,
      c
    )
    assert.equal(served.source, 'rendered', 'corrupt bytes must not be served as the stored truth')
  })
})

test('a caller who does not own the order never touches the store and persists nothing', async () => {
  await inRollback(async (c: PoolClient) => {
    await insertRow(c, { path: 'pdfs/x/new.pdf', checksum: sha256(STORED), hoursAgo: 1 })

    const r = renderer()
    const storage = reader(STORED)
    const served = await serveOrderDocument(
      {
        kind: 'invoice',
        order_id: order.id,
        caller: { id: randomUUID(), role: 'user' },
        render: r.render,
      },
      storage.read,
      c
    )

    assert.equal(served.source, 'rendered')
    assert.deepEqual(storage.paths, [], 'the store answered a caller the order does not belong to')
    assert.equal(r.calls.length, 1)
    assert.equal(await pdfRowCount(c), 1, "a stranger's render must not enter the paper trail")
  })
})

test('the default reader refuses in a test run, and the download still answers', async () => {
  await inRollback(async (c: PoolClient) => {
    await insertRow(c, { path: 'pdfs/x/new.pdf', checksum: sha256(STORED), hoursAgo: 1 })

    const served = await serveOrderDocument(
      { kind: 'invoice', order_id: order.id, caller: owner, render: renderer().render },
      undefined,
      c
    )
    assert.equal(served.source, 'rendered')
  })
})
