import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import * as orderRead from '#orders/read.ts'
import * as inputs from '#documents/pdfs/order-inputs.ts'
import { buildPackingScrapRows, buildInvoiceScrapRows } from '#documents/pdfs/render/sections.ts'
import {
  buildInvoiceHtml,
  buildPackingListHtml,
  buildSalesOrderInvoiceHtml,
} from '#documents/pdfs/service.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import type { OrderView, OrderViewItem, OrderPricingLine } from '@dorado/contracts'

const scrapLines = (lines: OrderViewItem[]): OrderViewItem[] =>
  lines.filter((line) => line.bullion_id === null)

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

const percentages = (html: string) => [...html.matchAll(/>([\d.]+)%</g)].map((m) => m[1])

test("every order's packing list and invoice quote the same premiums", async () => {
  const disagreements: string[] = []
  let compared = 0

  for (const order of orders) {
    const scrap = scrapLines(order.items)
    if (!scrap.length) continue

    const own = await inputs.invoiceInputs(order.order.id)
    compared++

    const packing = percentages(buildPackingScrapRows(scrap, own.pricing.items))
    const invoice = percentages(buildInvoiceScrapRows(scrap, own.pricing.items))

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

test('a line with no premium renders unpriced on both documents, not differently', () => {
  const GOLD = 'Gold'
  const line = {
    id: 'line-1',
    order_id: 'order-1',
    bullion_id: null,
    metal_id: GOLD,
    price: null,
    premium: null,
    quantity: 1,
    content: 1,
    purity: 0.999,
    pre_melt: 1,
    post_melt: 1,
    unit: 't oz',
  } as unknown as OrderViewItem

  const prices: OrderPricingLine[] = []

  const packing = buildPackingScrapRows([line], prices)
  const invoice = buildInvoiceScrapRows([line], prices)

  assert.deepEqual(
    percentages(packing),
    percentages(invoice),
    'the two documents rendered different percentages'
  )
  assert.deepEqual(percentages(packing), ['99.9'], 'a document invented a rate')
  assert.ok(packing.includes('&mdash;'), 'the packing list did not mark the premium unknown')
  assert.ok(invoice.includes('&mdash;'), 'the invoice did not mark the premium unknown')
})

// LD F8. The invoice printed the INBOUND plus the RETURN leg as its "Shipping
// Fees" deduction and then printed `pricing.total`, which `order_pricing.sql`
// makes by subtracting the inbound leg alone - so on any cancelled order the
// printed lines missed the printed Total by exactly the return label.
const money = (html: string, label: string): number | null => {
  const row = new RegExp(
    `<td class="text-left[^"]*"[^>]*>\\s*${label}\\s*</td>[\\s\\S]{0,200}?<td class="text-right[^"]*"[^>]*>\\s*-?\\$([\\d,]+\\.\\d\\d)`
  ).exec(html)
  return row ? Number(row[1].replace(/,/g, '')) : null
}

test("the purchase invoice's own lines add up to the Total it prints", async () => {
  let compared = 0
  for (const order of orders) {
    const own = await inputs.invoiceInputs(order.order.id)
    const html = buildInvoiceHtml(own)

    const shipping = money(html, 'Shipping Fees')
    const total = money(html, 'Total:')
    if (shipping === null || total === null) continue
    compared++

    assert.equal(
      shipping,
      Number(own.pricing.shipping_charge.toFixed(2)),
      `PO ${order.order.number}: the deduction is not the charge the total was made from`
    )

    const scrap = money(html, 'Scrap Total') ?? 0
    const bullion = money(html, 'Bullion Total') ?? 0
    const payout = money(html, 'Payout Fees') ?? 0
    assert.ok(
      Math.abs(scrap + bullion - shipping - payout - total) < 0.02,
      `PO ${order.order.number}: lines ${scrap + bullion - shipping - payout} vs Total ${total}`
    )
  }
  assert.ok(compared > 0, 'no invoice was compared - this test proved nothing')
})

// LD F9. `sale_quote.sql` makes sales tax part of `order_total`, and no row
// printed it, so the refiner's copy showed a Total higher than its own lines.
test("the sales invoice prints the tax that is part of its own total", async () => {
  const sales: OrderView[] = []
  for (const row of await orderRead.list('sale', null)) {
    const view = await orderRead.view(row.id)
    if (view) sales.push(view)
  }
  assert.ok(sales.length > 0, 'dev has no sales orders to render')

  let withTax = 0
  for (const order of sales) {
    const html = buildSalesOrderInvoiceHtml(await inputs.salesOrderInvoiceInputs(order.order.id))
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

// LD F11. The slot was the literal "8:30AM" plus the date the PDF was rendered,
// so one document stated two different pickup times and a customer who
// re-downloaded it a week later was told the courier came that day.
test('the packing list prints no pickup date it invented', async () => {
  for (const order of orders) {
    const html = buildPackingListHtml(await inputs.packingListInputs(order.order.id))
    assert.doesNotMatch(html, /8:30AM/, `PO ${order.order.number} still prints a literal slot`)
  }
})

test('a return leg on the order does not move the invoice deduction away from the Total', async () => {
  const order = orders.find((o) => o.shipments.length > 0) ?? orders[0]
  const own = await inputs.invoiceInputs(order.order.id)
  const inbound = own.order.shipments.find((s) => s.direction !== 'Return')

  const withReturn = {
    order: {
      ...own.order,
      shipments: [
        ...own.order.shipments,
        { ...(inbound ?? own.order.shipments[0]), id: 'return', direction: 'Return', cost: 41.37 },
      ],
    },
    pricing: own.pricing,
    package: null,
  } as typeof own

  const html = buildInvoiceHtml(withReturn)
  assert.equal(
    money(html, 'Shipping Fees'),
    Number(own.pricing.shipping_charge.toFixed(2)),
    'the return label was added to a deduction the Total does not carry'
  )
})
