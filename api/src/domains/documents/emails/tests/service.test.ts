import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import pool from '#pool'
import * as emails from '#documents/emails/service.ts'
import { closeBrowser } from '#providers/pdfs/puppeteer.ts'
import * as orderRead from '#orders/read.ts'
import * as inputs from '#documents/pdfs/order-inputs.ts'
import * as pricing from '#pricing/index.ts'
import type { Transport } from '#providers/emails/nodemailer.ts'
import {
  formatPurchaseOrderNumber,
  formatSalesOrderNumber,
} from '#shared/utils/formatOrderNumbers.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import type { PoolClient } from 'pg'
import type { OrderView } from '@dorado/contracts'

type Message = Parameters<Transport['sendMail']>[0]

let orders: OrderView[]
let salesOrders: OrderView[]
let lockClient: PoolClient

const viewsOf = async (direction: 'purchase' | 'sale') => {
  const out: OrderView[] = []
  for (const row of await orderRead.list(direction, null)) {
    const view = await orderRead.view(row.id)
    if (view) out.push(view)
  }
  return out
}

beforeAll(async () => {
  assert.equal(
    new Date().getTimezoneOffset(),
    0,
    'these tests require TZ=UTC - run them with `pnpm --filter @dorado/api test`'
  )
  lockClient = await pool.connect()
  await lockClient.query('SELECT pg_advisory_lock($1)', [LOCKS.ORDERS])
  orders = await viewsOf('purchase')
  salesOrders = await viewsOf('sale')
})

afterAll(async () => {
  await lockClient.query('SELECT pg_advisory_unlock($1)', [LOCKS.ORDERS])
  lockClient.release()
  await closeBrowser()
  await pool.end()
})

function recorder(): Transport & { sent: Message[] } {
  const sent: Message[] = []
  return {
    sent,
    sendMail: async (message: Message) => {
      sent.push(message)
      return { messageId: 'recorded', accepted: [message.to] }
    },
  }
}

function failing() {
  return {
    sendMail: async () => {
      throw new Error('Invalid login: 535 Authentication failed')
    },
  }
}

const startsPdf = (content: string | Buffer | Uint8Array, what: string) => {
  assert.ok(typeof content !== 'string', `${what} arrived as text, not bytes`)
  assert.equal(Buffer.from(content.subarray(0, 5)).toString(), '%PDF-', `${what} is not a PDF`)
}

const anOrderWithAUser = () => {
  const order = orders.find((o) => o.user?.email && o.items.length > 0) ?? orders[0]
  assert.ok(order, 'dev has no purchase order to email')
  assert.ok(order.user?.email, `order ${order.order.id} has no email address to send to`)
  return { order, email: order.user!.email }
}

const aSaleOrderWithAUser = () => {
  const order = salesOrders.find((o) => o.user?.email && o.items.length > 0) ?? salesOrders[0]
  assert.ok(order, 'dev has no sales order to email')
  assert.ok(order.user?.email, `order ${order.order.id} has no email address to send to`)
  return { order, email: order.user!.email }
}

test('the order confirmation goes to the customer with its packing list attached', async () => {
  const { order, email } = anOrderWithAUser()
  const t = recorder()

  await emails.sendCreatedEmail(await inputs.packingListInputs(order.order.id), email, t)

  assert.equal(t.sent.length, 1, 'expected exactly one message')
  const [msg] = t.sent
  assert.equal(msg.to, email, 'sent to the wrong address')
  assert.match(String(msg.subject), /Order Has Been Placed/)
  assert.ok((msg.html?.length ?? 0) > 0, 'no body')

  assert.ok(msg.attachments, 'the message carries no attachments at all')
  assert.equal(msg.attachments.length, 1)
  const [pdf] = msg.attachments
  assert.equal(pdf.contentType, 'application/pdf')
  assert.equal(
    pdf.filename,
    `${formatPurchaseOrderNumber(order.order.number)}_packing_list.pdf`,
    'the attachment is named for a different order'
  )
  startsPdf(pdf.content, 'the packing list attachment')
})

test("a sale order's confirmation renders the sale's own wording, named for the sale's own number", async () => {
  const { order, email } = aSaleOrderWithAUser()
  const t = recorder()

  await emails.sendCreatedEmail(await inputs.packingListInputs(order.order.id), email, t)

  assert.equal(t.sent.length, 1, 'expected exactly one message')
  const [msg] = t.sent
  assert.equal(msg.to, email, 'sent to the wrong address')
  assert.match(String(msg.subject), /Order Has Been Placed/)
  assert.ok((msg.html ?? '').includes('prepared for shipment'), 'the sale wording did not render')
  assert.ok(
    !(msg.html ?? '').includes('Please print out your packing list'),
    'the purchase-order shipping instructions rendered for a sale'
  )

  assert.ok(msg.attachments, 'the message carries no attachments at all')
  assert.equal(msg.attachments.length, 1)
  const [pdf] = msg.attachments
  assert.equal(
    pdf.filename,
    `${formatSalesOrderNumber(order.order.number)}_packing_list.pdf`,
    'the attachment is named for a different order'
  )
  startsPdf(pdf.content, 'the packing list attachment')
})

test('the pricing notice carries the invoice, named for the same order', async () => {
  const { order, email } = anOrderWithAUser()
  const t = recorder()

  await emails.sendPricedEmail(await inputs.invoiceInputs(order.order.id), email, t)

  const [msg] = t.sent
  assert.equal(msg.to, email)
  assert.match(String(msg.subject), new RegExp(formatPurchaseOrderNumber(order.order.number)))
  assert.ok(msg.attachments, 'the message carries no attachments at all')
  assert.equal(
    msg.attachments[0].filename,
    `${formatPurchaseOrderNumber(order.order.number)}_invoice.pdf`
  )
  startsPdf(msg.attachments[0].content, 'the invoice attachment')
})

test("the refiner's copy goes to the address it was given, not the customer's", async () => {
  const order = salesOrders.find((o) => o.items.length > 0) ?? salesOrders[0]
  assert.ok(order, 'dev has no sales orders')
  const t = recorder()

  await emails.sendSalesOrderToSupplier(
    await inputs.salesOrderInvoiceInputs(order.order.id),
    'refiner@example.com',
    t
  )

  const [msg] = t.sent
  assert.equal(msg.to, 'refiner@example.com', "the refiner's copy went somewhere else")
  assert.notEqual(msg.to, order.user?.email)
  assert.match(String(msg.subject), new RegExp(formatSalesOrderNumber(order.order.number)))
  assert.ok(msg.attachments, 'the message carries no attachments at all')
  assert.equal(
    msg.attachments[0].filename,
    `${formatSalesOrderNumber(order.order.number)}_invoice.pdf`
  )
})

test('a transport failure propagates rather than being swallowed', async () => {
  const { order, email } = anOrderWithAUser()

  await assert.rejects(
    async () =>
      emails.sendCreatedEmail(await inputs.packingListInputs(order.order.id), email, failing()),
    /Authentication failed/,
    'a failed send was reported as success'
  )
})

test('nothing is sent when the order cannot be priced', async () => {
  const t = recorder()
  const absent = '00000000-0000-4000-8000-0000000000ff'

  await assert.rejects(() => pricing.priceOrder(absent), /nothing to price/)
  await assert.rejects(() => inputs.invoiceInputs(absent), /no order/)
  assert.equal(t.sent.length, 0, 'a message went out with no document')
})
