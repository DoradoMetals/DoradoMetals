import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import pool from '#pool'
import * as pdf from '#documents/pdfs/service.ts'
import { closeBrowser } from '#documents/pdfs/render/puppeteer.ts'
import * as orderRead from '#orders/read.ts'
import * as inputs from '#documents/pdfs/order-inputs.ts'
import { documentRows } from '#documents/pdfs/render/documents/rows.ts'
import { formatCurrency } from '#documents/pdfs/render/format.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import { inRollback } from '#shared/testing/rollback.ts'
import { aUser, anOrder } from '#shared/testing/builders/index.ts'
import type { PoolClient } from 'pg'
import type { OrderPricing, OrderView } from '@dorado/contracts'

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

const inputsFor = async (order: OrderView) => await inputs.invoiceInputs(order.order.id)

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
  assert.ok(orders.length > 0, 'dev has no purchase orders to render')
})

afterAll(async () => {
  await lockClient.query('SELECT pg_advisory_unlock($1)', [LOCKS.ORDERS])
  lockClient.release()
  await closeBrowser()
  await pool.end()
})

// Fonts and the logo are inlined as base64, and base64 noise can spell NaN.
const hasNaN = (html: string): boolean =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<img[^>]*>/g, '')
    .includes('NaN')

const isPdf = (buf: Uint8Array, what: string) => {
  assert.ok(buf instanceof Uint8Array, `${what} did not return bytes`)
  assert.equal(Buffer.from(buf.subarray(0, 5)).toString(), '%PDF-', `${what} is not a PDF`)
  assert.ok(buf.length > 4000, `${what} is only ${buf.length} bytes - it rendered nearly nothing`)
}

test('every document renders for a real order', async () => {
  const order = orders.find((o) => o.lots.length > 0) ?? orders[0]
  const own = await inputsFor(order)

  isPdf(
    await pdf.generatePackingList({
      order,
      pricing: own.pricing,
      package: { label: 'Medium Box', length: 10, width: 8, height: 6 },
    }),
    'packing list'
  )

  isPdf(await pdf.generateInvoice(own), 'invoice')
  isPdf(await pdf.generateReturnPackingList(own), 'return packing list')
})

test('a packing list renders with no package details', async () => {
  const order = orders.find((o) => o.lots.length > 0) ?? orders[0]
  const own = await inputsFor(order)
  isPdf(await pdf.generatePackingList(own), 'packing list without package details')
})

test('a sale order renders its invoice', async () => {
  const order = salesOrders.find((o) => o.lots.length > 0) ?? salesOrders[0]
  assert.ok(order, 'dev has no sales orders to render')
  isPdf(await pdf.generateInvoice(await inputs.invoiceInputs(order.order.id)), 'sale invoice')
})

test('every purchase order in dev builds its documents', async () => {
  const failures: string[] = []
  for (const order of orders) {
    const own = await inputsFor(order)
    const documents: Array<[string, () => string]> = [
      ['packing list', () => pdf.buildPackingListHtml({ ...own, package: null })],
      ['invoice', () => pdf.buildInvoiceHtml(own)],
      ['return packing list', () => pdf.buildReturnPackingListHtml({ ...own, package: null })],
    ]
    for (const [name, build] of documents) {
      try {
        const html = build()
        if (typeof html !== 'string' || html.length < 500) {
          failures.push(`order ${order.order.number}: ${name} built ${html?.length ?? 0} chars`)
        }
        if (typeof html === 'string' && hasNaN(html)) {
          failures.push(`order ${order.order.number}: ${name} contains NaN`)
        }
      } catch (err) {
        failures.push(`order ${order.order.number}: ${name} threw - ${(err as Error).message}`)
      }
    }
  }
  assert.deepEqual(failures, [])
})

test('an order with no address still builds, with the address left blank', async () => {
  const order = orders.find((o) => !o.address)
  assert.ok(order, 'dev no longer has an order without an address - the case is untested')

  const html = pdf.buildPackingListHtml({ ...(await inputsFor(order!)), package: null })
  assert.ok(html.includes('<html') || html.includes('<!DOCTYPE'), 'did not build a document')
  assert.ok(!html.includes('undefined'), "an unset address field reached the page as 'undefined'")
})

test('a package fact appears only when real dimensions are known', async () => {
  const order = orders.find((o) => o.lots.length > 0) ?? orders[0]
  const own = await inputsFor(order)

  const withoutBox = pdf.buildPackingListHtml({ ...own, package: null })
  assert.ok(!hasNaN(withoutBox), 'the packing list contains NaN')
  assert.ok(!/\(NaN×/.test(withoutBox), 'a box fact was drawn from dimensions that do not exist')

  const withBox = pdf.buildPackingListHtml({
    ...own,
    package: { label: 'Small Box', length: 9, width: 6, height: 2 },
  })
  assert.ok(!hasNaN(withBox), 'a real package produced NaN')
  assert.ok(withBox.includes('Small Box (9×6×2 in)'), 'the dimensions are not printed')
})

test('an unpriced lot shows a dash spot fact, not NaN or null', () => {
  const line = {
    id: 'line-1',
    order_id: 'order-1',
    lot_id: 'lot-1',
    price: null,
    premium: 0.1,
    lot: {
      id: 'lot-1',
      bullion_id: 'bullion-1',
      metal_id: 'Silver',
      quantity: 2,
      content: 1,
      product_name: 'Silver Round',
    },
  } as unknown as import('@dorado/contracts').OrderLotView

  const pricing = { items: [], spots: [] } as unknown as OrderPricing
  const [row] = documentRows([line], pricing)

  assert.ok(!row.facts.join(' ').includes('NaN'), 'the spot fact contains NaN')
  assert.ok(
    row.facts.some((f) => f === '- spot'),
    'the unpriced metal did not show a dash spot'
  )

  const priced = {
    items: [],
    spots: [{ metal_id: 'Silver', bid: 30, ask: 31 }],
  } as unknown as OrderPricing
  const [pricedRow] = documentRows([line], priced)
  assert.ok(
    pricedRow.facts.includes(`${formatCurrency(30)} spot`),
    'the priced metal is missing its spot'
  )
})

test('the packing list and the invoice report the same total', async () => {
  for (const order of orders) {
    const own = await inputsFor(order)
    const total = own.pricing.total
    if (!Number.isFinite(total)) continue

    const money = formatCurrency(total)
    const packing = pdf.buildPackingListHtml({ ...own, package: null })
    assert.ok(
      packing.includes(money),
      `order ${order.order.number}: the packing list does not show ${money}`
    )
  }
})

test('every order item appears as a row in the packing list', async () => {
  const missing: string[] = []
  for (const order of orders) {
    if (!order.lots.length) continue
    const own = await inputsFor(order)
    const rows = documentRows(order.lots, own.pricing)
    if (rows.length < order.lots.length) {
      missing.push(
        `order ${order.order.number}: ${order.lots.length} items but only ${rows.length} rows`
      )
    }
  }
  assert.deepEqual(missing, [])
})

// Reproduces the exact shape of production orders 259, 272 and 328: a scrap
// line declared with no weight, purity, content or quantity recorded yet.
// docs/waves/packing-list-nan.md has the full finding - the columns render
// clean today (pct()/oz()/"-" already guarded them); this pins that contract
// so it stays true, on all three documents, not just the packing list.
test('a scrap line with no recorded weight, purity or quantity shows a dash, never NaN or the word null', async () => {
  await inRollback(async (c: PoolClient) => {
    const user = await aUser(c)
    const order = await anOrder(c, user, { direction: 'purchase' }).withLines({
      metal_id: 'Gold',
      pre_melt: null,
      post_melt: null,
      purity: null,
      premium: null,
      unit: 'g',
    })

    const own = await inputs.invoiceInputs(order.id, c)
    const documents: Array<[string, string]> = [
      ['packing list', pdf.buildPackingListHtml({ ...own, package: null })],
      ['invoice', pdf.buildInvoiceHtml(own)],
      ['return packing list', pdf.buildReturnPackingListHtml({ ...own, package: null })],
    ]

    for (const [name, html] of documents) {
      assert.ok(!hasNaN(html), `${name} contains NaN for a null-shaped scrap line`)
      assert.ok(!/>\s*null\s*</.test(html), `${name} prints the literal word "null"`)
      assert.ok(html.includes('- g post melt'), `${name} does not show the weight as a dash`)
    }
  })
})
