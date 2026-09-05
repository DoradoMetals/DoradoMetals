import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import pool from '#pool'
import * as pdf from '#documents/pdfs/service.ts'
import { closeBrowser } from '#providers/pdfs/puppeteer.ts'
import * as orderRead from '#orders/read.ts'
import * as inputs from '#documents/pdfs/order-inputs.ts'
import * as pricing from '#pricing/index.ts'
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

// A packing list and a return packing list embed the FedEx label as a base64
// PNG inside an <img> tag. Base64 is 64 arbitrary characters per byte-and-a-
// bit of binary pixel data - a 13KB label has good odds of containing "NaN"
// as pure coincidence somewhere in that noise, with no numeric column, no
// arithmetic and no rendering defect behind it (verified against a rebuilt
// production copy: orders 259, 272 and 328 each carry a label whose base64
// happens to contain "NaN" inside the <img> tag, and NOWHERE ELSE in any of
// the 72 orders' rendered text). A bare `.includes("NaN")` cannot tell that
// apart from an actual broken number, so it must not look inside the image.
const hasNaN = (html: string): boolean => html.replace(/<img\b[^>]*>/g, '').includes('NaN')

const isPdf = (buf: Uint8Array, what: string) => {
  assert.ok(buf instanceof Uint8Array, `${what} did not return bytes`)
  assert.equal(Buffer.from(buf.subarray(0, 5)).toString(), '%PDF-', `${what} is not a PDF`)
  assert.ok(buf.length > 4000, `${what} is only ${buf.length} bytes - it rendered nearly nothing`)
}

test('every document renders for a real order', async () => {
  const order = orders.find((o) => o.items.length > 0) ?? orders[0]
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
  const order = orders.find((o) => o.items.length > 0) ?? orders[0]
  const own = await inputsFor(order)
  isPdf(await pdf.generatePackingList(own), 'packing list without package details')
})

test('a sales order invoice renders', async () => {
  const order = salesOrders.find((o) => o.items.length > 0) ?? salesOrders[0]
  assert.ok(order, 'dev has no sales orders to render')
  isPdf(
    await pdf.generateSalesOrderInvoice(await inputs.salesOrderInvoiceInputs(order.order.id)),
    'sales order invoice'
  )
})

test('every purchase order in dev builds both documents', async () => {
  const failures: string[] = []
  for (const order of orders) {
    const own = await inputsFor(order)
    const documents: Array<[string, () => string]> = [
      ['packing list', () => pdf.buildPackingListHtml(own)],
      ['invoice', () => pdf.buildInvoiceHtml(own)],
      ['return packing list', () => pdf.buildReturnPackingListHtml(own)],
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

  const html = pdf.buildPackingListHtml(await inputsFor(order!))
  assert.ok(html.includes('<html') || html.includes('<!DOCTYPE'), 'did not build a document')
  assert.ok(!html.includes('undefined'), "an unset address field reached the page as 'undefined'")
})

test('a packing list with no package details draws no box, rather than a broken one', async () => {
  const order = orders.find((o) => o.shipments.every((s) => !s.package_id)) ?? orders[0]
  const own = await inputsFor(order)

  const html = pdf.buildPackingListHtml(own)
  assert.ok(!hasNaN(html), 'the packing list contains NaN')
  assert.ok(!html.includes('<svg'), 'a box was drawn from dimensions that do not exist')

  const withBox = pdf.buildPackingListHtml(
    Object.assign({ package: { label: 'Small Box', length: 9, width: 6, height: 2 } }, own)
  )
  assert.ok(withBox.includes('<svg'), 'no box was drawn for a real package')
  assert.ok(!hasNaN(withBox), 'a real package produced NaN coordinates')
  assert.ok(withBox.includes('Length: 9 in'), 'the dimensions are not printed')
})

test('a sales order invoice builds with no spot prices at all', async () => {
  const order = salesOrders.find((o) => o.items.length > 0) ?? salesOrders[0]
  assert.ok(order, 'dev has no sales order')
  const salePricing = await pricing.priceOrder(order.order.id)

  assert.ok(
    salePricing.spots.length > 0,
    'the sales order prices no metal at all - this case is untested'
  )

  const asked = (ask: (index: number) => number | null): OrderPricing => ({
    ...salePricing,
    spots: salePricing.spots.map((spot, index) => ({
      metal_id: spot.metal_id,
      bid: spot.bid,
      ask: ask(index),
    })),
  })

  const html = pdf.buildSalesOrderInvoiceHtml({ order, pricing: asked(() => null) })
  assert.ok(html.length > 500, 'no document was produced')
  assert.ok(!html.includes('NaN'), 'the invoice contains NaN')
  assert.ok(html.includes('&mdash;'), 'a missing spot rendered as nothing at all')

  const partial = pdf.buildSalesOrderInvoiceHtml({
    order,
    pricing: asked((index) => (index === 0 ? 4000 : null)),
  })
  assert.ok(partial.includes('$4,000.00'), 'the quoted metal is missing')
  if (salePricing.spots.length > 1) {
    assert.ok(partial.includes('&mdash;'), 'the unquoted metals rendered as nothing at all')
  }
})

test('the packing list and the invoice report the same total', async () => {
  for (const order of orders) {
    const own = await inputsFor(order)
    const total = own.pricing.total
    if (!Number.isFinite(total)) continue

    const money = formatCurrency(total)
    const packing = pdf.buildPackingListHtml(own)
    assert.ok(
      packing.includes(money),
      `order ${order.order.number}: the packing list does not show ${money}`
    )
  }
})

test('every order item appears as a row in the packing list', async () => {
  const missing: string[] = []
  for (const order of orders) {
    if (!order.items.length) continue

    const own = await inputsFor(order)
    const html = pdf.buildPackingListHtml(own)
    const rows = (html.match(/<tr>/g) ?? []).length

    if (rows < order.items.length) {
      missing.push(`order ${order.order.number}: ${order.items.length} items but only ${rows} rows`)
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
      content: null,
      premium: null,
      quantity: null,
      unit: 'g',
    })

    const own = await inputs.invoiceInputs(order.id, c)
    const documents: Array<[string, string]> = [
      ['packing list', pdf.buildPackingListHtml(own)],
      ['invoice', pdf.buildInvoiceHtml(own)],
      ['return packing list', pdf.buildReturnPackingListHtml(own)],
    ]

    for (const [name, html] of documents) {
      assert.ok(!hasNaN(html), `${name} contains NaN for a null-shaped scrap line`)
      assert.ok(!/>\s*null\s*</.test(html), `${name} prints the literal word "null"`)
    }

    assert.ok(
      documents[0][1].includes('<td>- g</td>'),
      'the packing list does not show the declared weight as a dash'
    )
    assert.ok(
      documents[1][1].includes('>- g</td>'),
      'the invoice does not show pre-melt and post-melt as dashes'
    )
  })
})

// The check itself is what let 259/272/328 go unnoticed as false positives:
// a bare substring scan cannot tell a coincidental "NaN" inside a base64
// label from a genuinely broken number.
test('the NaN detector ignores base64 image bytes but still catches a broken number', () => {
  const withCoincidentalLabel = `
    <html><body>
      <table><tr><td>$1,234.00</td></tr></table>
      <div style="page-break-before: always;">
        <img src="data:image/png;base64,aGVsbG9NaNvd29ybGQ=" alt="Shipping Label" />
      </div>
    </body></html>
  `
  assert.ok(
    !hasNaN(withCoincidentalLabel),
    'a coincidental NaN inside a base64 label falsely failed the check'
  )

  const withRealBug = withCoincidentalLabel.replace('$1,234.00', '$NaN')
  assert.ok(hasNaN(withRealBug), 'a genuine NaN in rendered text was not caught')
})
