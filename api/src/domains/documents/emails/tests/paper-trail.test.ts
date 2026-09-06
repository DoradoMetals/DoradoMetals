import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import { randomUUID } from 'node:crypto'
import pool from '#pool'
import * as emails from '#documents/emails/service.ts'
import { recordEmail } from '#documents/emails/record.ts'
import { closeBrowser } from '#providers/pdfs/puppeteer.ts'
import * as orderRead from '#orders/read.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { inRollback } from '#shared/testing/rollback.ts'
import type { Transport } from '#providers/emails/nodemailer.ts'
import type { OrderView } from '@dorado/contracts'

let client: PoolClient
type Message = Parameters<Transport['sendMail']>[0]

let orders: OrderView[]

beforeAll(async () => {
  client = await pool.connect()
  await client.query('SELECT pg_advisory_lock($1)', [LOCKS.ORDERS])
  orders = []
  for (const row of await orderRead.list('purchase', null)) {
    const view = await orderRead.view(row.id)
    if (view) orders.push(view)
  }
  assert.ok(orders.length > 0, 'dev has no purchase orders to render')
})

afterAll(async () => {
  await client.query('SELECT pg_advisory_unlock($1)', [LOCKS.ORDERS])
  client.release()
  await closeBrowser()
  await pool.end()
})

const recorder = (): Transport & { sent: Message[] } => {
  const sent: Message[] = []
  return {
    sent,
    sendMail: async (msg: Message) => {
      sent.push(msg)
      return { messageId: '<recorded@test>' }
    },
  }
}

const failing = () => ({
  sendMail: async () => {
    throw new Error('Invalid login: 535 Authentication failed')
  },
})

const anOrderWithAUser = () => {
  const order = orders.find((o) => o.user?.email && o.lots.length > 0) ?? orders[0]
  assert.ok(order, 'dev has no purchase order to email')
  assert.ok(order.user?.email, `order ${order.order.id} has no email address to send to`)
  return { order, email: order.user!.email, user: order.user! }
}

test('a successful send leaves a sent row pointing at its stored document', async () => {
  await inRollback(async (c: PoolClient) => {
    const { order, email, user } = anOrderWithAUser()
    await emails.sendOrderReceived(order.order.id, recorder(), c)

    const { rows } = await c.query(
      `SELECT e.status, e.to_address, e.provider_message_id, e.order_id, e.pdf_id,
              p.kind AS pdf_kind, p.checksum, p.size_bytes
         FROM media.emails e
         LEFT JOIN media.pdfs p ON p.id = e.pdf_id
        WHERE e.kind = 'purchase_order_created'`
    )
    assert.equal(rows.length, 1, 'one send, one row')
    const r = rows[0]
    assert.equal(r.status, 'sent')
    assert.equal(r.to_address, email)
    assert.equal(r.provider_message_id, '<recorded@test>')
    assert.ok(r.pdf_id, 'the send does not point at its document')
    assert.equal(r.pdf_kind, 'packing_list')
    assert.ok(Number(r.size_bytes) > 0, 'the document row has no size')
    assert.match(r.checksum, /^[0-9a-f]{64}$/, 'no sha256 on the document')
  })
})

test('a failed send throws AND leaves a failed row carrying the error', async () => {
  await inRollback(async (c: PoolClient) => {
    const { order, email } = anOrderWithAUser()
    await assert.rejects(
      async () => emails.sendOrderReceived(order.order.id, failing(), c),
      /535 Authentication failed/
    )

    const { rows } = await c.query(
      `SELECT status, error, to_address, provider_message_id
         FROM media.emails WHERE kind = 'purchase_order_created'`
    )
    assert.equal(rows.length, 1, 'a customer who never got their confirmation left no trace')
    assert.equal(rows[0].status, 'failed')
    assert.equal(rows[0].to_address, email)
    assert.match(rows[0].error, /535 Authentication failed/)
    assert.equal(rows[0].provider_message_id, null)
  })
})

test('a record for an order the new schema does not know keeps everything but the link', async () => {
  await inRollback(async (c: PoolClient) => {
    await recordEmail(
      {
        kind: 'sales_order_to_supplier',
        to: 'refiner@example.test',
        subject: 'paper-trail probe',
        order_id: randomUUID(),
      },
      { status: 'sent' },
      c
    )
    const { rows } = await c.query(
      `SELECT order_id, to_address FROM media.emails WHERE subject = 'paper-trail probe'`
    )
    assert.equal(rows.length, 1)
    assert.equal(rows[0].order_id, null, 'the bogus link should have been dropped, not the row')
    assert.equal(rows[0].to_address, 'refiner@example.test')
  })
})

test('without a transaction, a test-run send records nothing', async () => {
  const { order, email, user } = anOrderWithAUser()
  await emails.sendOrderReceived(order.order.id, recorder())
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM media.emails WHERE kind = 'purchase_order_created'`
  )
  assert.equal(rows[0].n, 0, 'an executor-less test send committed a real row - the guard rotted')
})

test('a sign-up mail leaves an account_created row with its user', async () => {
  await inRollback(async (c: PoolClient) => {
    const { order, email, user } = anOrderWithAUser()
    const t = recorder()
    await emails.sendAuthVerificationEmail(
      { id: user.id, email: email, name: user.name },
      'https://example.test/verify-email?token=t',
      true,
      t,
      c
    )

    assert.equal(t.sent.length, 1, 'nothing left the recorder')
    assert.equal(t.sent[0].subject, 'Welcome to Dorado Metals Exchange')

    const { rows } = await c.query(
      `SELECT status, to_address, user_id, order_id, pdf_id, provider_message_id
         FROM media.emails WHERE kind = 'account_created' AND to_address = $1`,
      [email]
    )
    assert.equal(rows.length, 1, 'one send, one row')
    assert.equal(rows[0].status, 'sent')
    assert.equal(rows[0].to_address, email)
    assert.equal(rows[0].user_id, user.id)
    assert.equal(rows[0].order_id, null, 'a verification mail has no order')
    assert.equal(rows[0].pdf_id, null, 'and no document')
    assert.equal(rows[0].provider_message_id, '<recorded@test>')
  })
})

test('a failed verification mail throws, reaches better-auth unchanged, and is recorded', async () => {
  await inRollback(async (c: PoolClient) => {
    await assert.rejects(
      () =>
        emails.sendAuthVerificationEmail(
          { id: null, email: 'new-signup@example.test', name: 'New Signup' },
          'https://example.test/verify-email?token=t',
          false,
          failing(),
          c
        ),
      /535 Authentication failed/
    )

    const { rows } = await c.query(
      `SELECT status, error, user_id FROM media.emails
        WHERE kind = 'auth_verification' AND to_address = 'new-signup@example.test'`
    )
    assert.equal(rows.length, 1, 'a verification mail that never arrived left no trace')
    assert.equal(rows[0].status, 'failed')
    assert.match(rows[0].error, /535 Authentication failed/)
  })
})
