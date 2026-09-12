import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import * as orderRead from '#orders/read.ts'
import * as inputs from '#documents/pdfs/order-inputs.ts'
import { documentRows } from '#documents/pdfs/render/documents/rows.ts'
import { buildInvoiceHtml } from '#documents/pdfs/render/documents/invoice.ts'
import { buildPackingListHtml } from '#documents/pdfs/render/documents/shipment-manifest.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import type { OrderView, OrderLotView, OrderPricing } from '@dorado/contracts'

const scrapLines = (lines: OrderLotView[]): OrderLotView[] =>
  lines.filter((line) => line.lot.bullion_id === null)

let orders: OrderView[]
let lockClient: PoolClient

beforeAll(async () => {
  lockClient = await pool.connect()
  await lockClient.query('SELECT pg_advisory_lock($1)', [LOCKS.ORDERS])

  const ids = (await orderRead.list('purchase', null)).map((o) => o.id)
  orders = []
  for (const id of ids) {
    const view = await orderRead.view(id)
    if (view) orders.push(view)
  }
  assert.ok(orders.length > 0, 'dev has no purchase orders')
})

afterAll(async () => {
  await lockClient.query('SELECT pg_advisory_unlock($1)', [LOCKS.ORDERS])
  lockClient.release()
  await pool.end()
})

const percentages = (html: string): string[] => [...html.matchAll(/(\d+\.\d)%/g)].map((m) => m[1])

test("every order's packing list and invoice quote the same premiums", async () => {
  const disagreements: string[] = []
  let compared = 0

  for (const order of orders) {
    const scrap = scrapLines(order.lots)
    if (!scrap.length) continue

    const own = await inputs.invoiceInputs(order.order.id)
    compared++

    const packing = percentages(buildPackingListHtml({ ...own, package: null }))
    const invoice = percentages(buildInvoiceHtml(own))

    if (JSON.stringify(packing) !== JSON.stringify(invoice)) {
      disagreements.push(
        `  PO ${order.order.number}: packing ${JSON.stringify(packing)} vs invoice ${JSON.stringify(invoice)}`
      )
    }
  }

  assert.ok(compared > 0, 'no order in dev has scrap lines - this test compared nothing')
  assert.deepEqual(
    disagreements,
    [],
    `the two documents disagree on ${disagreements.length} order(s):\n${disagreements.join('\n')}`
  )
})

test('a line with no premium renders unpriced, not a rate it never had', () => {
  const line = {
    id: 'line-1',
    order_id: 'order-1',
    lot_id: 'lot-1',
    price: null,
    premium: null,
    lot: {
      id: 'lot-1',
      bullion_id: null,
      metal_id: 'Gold',
      quantity: 1,
      content: 1,
      purity: 0.999,
      pre_melt: 1,
      post_melt: 1,
      unit: 't oz',
      reference: 'Lot 1-A',
    },
  } as unknown as OrderLotView

  const pricing = { items: [], spots: [] } as unknown as OrderPricing
  const [row] = documentRows([line], pricing)

  assert.equal(percentages(row.facts.join(' · ')).join(','), '99.9', 'a document invented a rate')
  assert.ok(
    row.facts.some((f) => f?.startsWith('- premium')),
    'the premium was not marked unknown'
  )
})

const summarySection = (html: string): string => html.slice(html.indexOf('>Summary<'))

const money = (html: string, label: string): number | null => {
  const row = new RegExp(`>${label}<\\/p><p[^>]*>(-?\\$[\\d,]+\\.\\d\\d)<`).exec(
    summarySection(html)
  )
  return row ? Number(row[1].replace(/[$,]/g, '')) : null
}

test("the purchase invoice's own lines add up to the Total it prints", async () => {
  let compared = 0
  for (const order of orders) {
    const own = await inputs.invoiceInputs(order.order.id)
    const html = buildInvoiceHtml(own)

    const shipping = money(html, 'Shipping')
    const total = money(html, 'Total')
    if (shipping === null || total === null) continue
    compared++

    assert.equal(
      shipping,
      -Number(own.pricing.shipping_charge.toFixed(2)),
      `PO ${order.order.number}: the printed deduction is not the charge the total was made from`
    )

    const items = money(html, 'Items') ?? 0
    const payout = money(html, 'Payout') ?? 0
    assert.ok(
      Math.abs(items + shipping + payout - total) < 0.02,
      `PO ${order.order.number}: lines ${items + shipping + payout} vs Total ${total}`
    )
  }
  assert.ok(compared > 0, 'no invoice was compared - this test proved nothing')
})

test('the sales invoice prints the tax that is part of its own total', async () => {
  const sales: OrderView[] = []
  for (const row of await orderRead.list('sale', null)) {
    const view = await orderRead.view(row.id)
    if (view) sales.push(view)
  }
  assert.ok(sales.length > 0, 'dev has no sales orders to render')

  let withTax = 0
  for (const order of sales) {
    const html = buildInvoiceHtml(await inputs.invoiceInputs(order.order.id))
    const tax = Number(order.totals?.sales_tax ?? 0)
    if (tax > 0) {
      withTax++
      assert.equal(
        money(html, 'Sales Tax'),
        Number(tax.toFixed(2)),
        `SO ${order.order.number}: the tax it charged is not on the invoice`
      )
    } else {
      assert.equal(money(html, 'Sales Tax'), null, 'a zero tax row was printed')
    }
  }
  assert.ok(withTax > 0, 'no dev sales order carries tax - this test proved nothing')
})

test('the packing list prints no pickup time it invented', async () => {
  for (const order of orders) {
    const html = buildPackingListHtml(await inputs.packingListInputs(order.order.id))
    assert.doesNotMatch(html, /8:30\s*AM/i, `PO ${order.order.number} still prints a literal slot`)
  }
})

test('a return leg on the order does not move the invoice deduction away from the Total', async () => {
  const order = orders.find((o) => o.shipments.length > 0) ?? orders[0]
  const own = await inputs.invoiceInputs(order.order.id)

  const withReturn: OrderView = {
    ...own.order,
    shipments: [
      ...own.order.shipments,
      { id: 'return', direction: 'Return', cost: 41.37 } as OrderView['shipments'][number],
    ],
  }

  const html = buildInvoiceHtml({ order: withReturn, pricing: own.pricing })
  assert.equal(
    money(html, 'Shipping'),
    -Number(own.pricing.shipping_charge.toFixed(2)),
    'the return label moved a deduction the Total does not carry'
  )
})
