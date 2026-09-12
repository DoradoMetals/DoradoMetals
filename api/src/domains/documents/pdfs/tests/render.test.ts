import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import * as orderRead from '#orders/read.ts'
import * as inputs from '#documents/pdfs/order-inputs.ts'
import { buildInvoiceHtml } from '#documents/pdfs/render/documents/invoice.ts'
import {
  buildPackingListHtml,
  buildReturnPackingListHtml,
} from '#documents/pdfs/render/documents/shipment-manifest.ts'
import { buildPickupManifestHtml } from '#documents/pdfs/render/documents/pickup-manifest.ts'
import { buildIntakeReceiptHtml } from '#documents/pdfs/render/documents/intake-receipt.ts'
import { buildShippingInstructionsHtml } from '#documents/pdfs/render/documents/shipping-instructions.ts'
import { buildPickupInstructionsHtml } from '#documents/pdfs/render/documents/pickup-instructions.ts'
import { buildAppointmentInstructionsHtml } from '#documents/pdfs/render/documents/appointment-instructions.ts'
import { buildRateSheetHtml } from '#documents/pdfs/render/documents/rate-sheet.ts'
import { buildAssayResultsHtml } from '#documents/pdfs/render/documents/assay-results.ts'
import { LOCKS } from '#shared/testing/locks.ts'
import type { AssayResultsDocument, OrderView } from '@dorado/contracts'

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

const carries = (html: string, text: string): boolean => html.includes(text.replace(/'/g, '&#x27;'))

const clean = (html: string, name: string) => {
  assert.ok(!html.includes('NaN'), `${name} contains NaN`)
  assert.ok(!/>\s*null\s*</.test(html), `${name} prints the literal word null`)
  assert.ok(!html.includes('undefined'), `${name} prints the literal word undefined`)
}

const wearsTheTheme = (html: string, name: string) => {
  assert.ok(html.includes(':root'), `${name} does not inline the theme's :root block`)
  assert.ok(html.includes('#0d0e11'), `${name} does not carry the ink token`)
  assert.ok(html.includes('#787c87'), `${name} does not carry the muted token`)
}

test('the invoice carries its own labels, the theme, and nothing broken', async () => {
  const order = orders.find((o) => o.lots.length > 0) ?? orders[0]
  const own = await inputs.invoiceInputs(order.order.id)
  const html = buildInvoiceHtml(own)

  clean(html, 'invoice')
  wearsTheTheme(html, 'invoice')
  assert.ok(html.includes('Invoice'), 'the eyebrow is missing')
  assert.ok(html.includes('Payment'), 'the Payment band cap is missing')
  assert.ok(html.includes('Items'), 'the Table cap is missing')
  assert.ok(html.includes('Payout'), 'the Table column head is missing')
  assert.ok(html.includes('Total'), 'the Summary total label is missing')
})

test('the shipment manifest and its return variant carry their own labels', async () => {
  const order = orders.find((o) => o.lots.length > 0) ?? orders[0]
  const own = await inputs.packingListInputs(order.order.id)

  for (const [name, html] of [
    ['packing list', buildPackingListHtml(own)],
    ['return packing list', buildReturnPackingListHtml(own)],
  ] as const) {
    clean(html, name)
    wearsTheTheme(html, name)
    assert.ok(html.includes('Shipment Manifest'), `${name}: the eyebrow is missing`)
    assert.ok(html.includes('Shipping'), `${name}: the Shipping band cap is missing`)
    assert.ok(html.includes('Estimated payout'), `${name}: the Hero label is missing`)
  }
})

test('the pickup manifest and intake receipt carry their own labels', async () => {
  const order = orders.find((o) => o.lots.length > 0) ?? orders[0]
  const own = await inputs.pickupManifestInputs(order.order.id)

  const pickup = buildPickupManifestHtml(own)
  clean(pickup, 'pickup manifest')
  wearsTheTheme(pickup, 'pickup manifest')
  assert.ok(pickup.includes('Pickup Manifest'), 'the eyebrow is missing')
  assert.ok(pickup.includes('Pickup'), 'the Pickup band cap is missing')

  const intake = buildIntakeReceiptHtml(own)
  clean(intake, 'intake receipt')
  wearsTheTheme(intake, 'intake receipt')
  assert.ok(intake.includes('Intake Receipt'), 'the eyebrow is missing')
  assert.ok(intake.includes('Appointment'), 'the Appointment band cap is missing')
})

const instructionCases = [
  {
    name: 'shipping instructions',
    build: buildShippingInstructionsHtml,
    eyebrow: 'Shipment Instructions',
    stepsCap: 'Before You Ship',
    steps: ['Print your packing list and label', 'Pack your items', 'Hand it over', "That's it"],
  },
  {
    name: 'pickup instructions',
    build: buildPickupInstructionsHtml,
    eyebrow: 'Pickup Instructions',
    stepsCap: 'Before The Pickup',
    steps: ['Gather your items', 'Be reachable', 'Hand it over at the door', "That's it"],
  },
  {
    name: 'appointment instructions',
    build: buildAppointmentInstructionsHtml,
    eyebrow: 'Appointment Instructions',
    stepsCap: 'Before You Arrive',
    steps: ['Gather your items', 'Bring a photo ID', 'Come to the office', "That's it"],
  },
]

for (const { name, build, eyebrow, stepsCap, steps } of instructionCases) {
  test(`${name} carries its own copy, the theme, and nothing broken`, () => {
    const html = build('PO-000041')
    clean(html, name)
    wearsTheTheme(html, name)
    assert.ok(html.includes(eyebrow), `${name}: the eyebrow is missing`)
    assert.ok(html.includes(stepsCap), `${name}: the Steps cap is missing`)
    for (const step of steps) {
      assert.ok(carries(html, step), `${name}: step "${step}" is missing`)
    }
  })
}

test('the appointment instructions complete the truncated Figma copy', () => {
  const html = buildAppointmentInstructionsHtml('PO-000041')
  assert.ok(
    html.includes('You confirm our quote pending final assay before you leave.'),
    'the completed Arrival copy is missing'
  )
})

test('the rate sheet carries its own labels and the theme', async () => {
  const doc = await inputs.rateSheetInputs()
  const html = buildRateSheetHtml(doc)
  clean(html, 'rate sheet')
  wearsTheTheme(html, 'rate sheet')
  assert.ok(html.includes('Rate Sheet'), 'the eyebrow is missing')
  assert.ok(html.includes('What we pay, by metal and weight.'), 'the Lead is missing')
  assert.ok(html.includes('How To Send It'), 'the Fulfilment cap is missing')
  assert.ok(html.includes('Getting Paid'), 'the Fees cap is missing')
  for (const metal of doc.metals) {
    assert.ok(html.includes(metal.name), `the ${metal.name} band is missing`)
  }
})

test('the assay results carries its own labels and the theme, with no money on it', async () => {
  let doc: AssayResultsDocument | null = null
  for (const order of orders) {
    try {
      doc = await inputs.assayResultsInputs(order.order.id)
      break
    } catch {
      continue
    }
  }
  if (!doc) return

  const html = buildAssayResultsHtml(doc)
  clean(html, 'assay results')
  wearsTheTheme(html, 'assay results')
  assert.ok(html.includes('Assay Results'), 'the eyebrow is missing')
  assert.ok(html.includes('Lots'), 'the Table cap is missing')
  assert.ok(html.includes('Fine content'), 'the Table column head is missing')
  assert.ok(!/\$[\d,]/.test(html), 'a dollar figure appears on a document that carries no money')
})
