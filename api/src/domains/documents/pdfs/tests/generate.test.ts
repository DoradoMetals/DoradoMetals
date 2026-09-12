import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import pool from '#pool'
import * as orderRead from '#orders/read.ts'
import * as inputs from '#documents/pdfs/order-inputs.ts'
import * as pdf from '#documents/pdfs/service.ts'
import { closeBrowser } from '#documents/pdfs/render/puppeteer.ts'
import { LOCKS } from '#shared/testing/locks.ts'

let order_id: string
let lockClient: PoolClient

beforeAll(async () => {
  lockClient = await pool.connect()
  await lockClient.query('SELECT pg_advisory_lock($1)', [LOCKS.ORDERS])
  const ids = (await orderRead.list('purchase', null)).map((o) => o.id)
  assert.ok(ids.length > 0, 'dev has no purchase orders')
  order_id = ids[0]!
})

afterAll(async () => {
  await closeBrowser()
  await lockClient.query('SELECT pg_advisory_unlock($1)', [LOCKS.ORDERS])
  lockClient.release()
  await pool.end()
})

const isPdf = (bytes: Uint8Array, what: string) => {
  assert.ok(bytes instanceof Uint8Array, `${what} did not return bytes`)
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), '%PDF-', `${what} is not a PDF`)
  assert.ok(bytes.length > 4000, `${what} is only ${bytes.length} bytes`)
}

test('every document kind renders to a real PDF at the drawn page size', async () => {
  const reference = await inputs.referenceInputs(order_id)

  isPdf(await pdf.generateInvoice(await inputs.invoiceInputs(order_id)), 'invoice')
  isPdf(
    await pdf.generatePackingList(await inputs.packingListInputs(order_id)),
    'shipment manifest'
  )
  isPdf(
    await pdf.generateReturnPackingList(await inputs.returnPackingListInputs(order_id)),
    'return shipment manifest'
  )
  isPdf(
    await pdf.generatePickupManifest(await inputs.pickupManifestInputs(order_id)),
    'pickup manifest'
  )
  isPdf(
    await pdf.generateIntakeReceipt(await inputs.intakeReceiptInputs(order_id)),
    'intake receipt'
  )
  isPdf(await pdf.generateShippingInstructions(reference), 'shipping instructions')
  isPdf(await pdf.generatePickupInstructions(reference), 'pickup instructions')
  isPdf(await pdf.generateAppointmentInstructions(reference), 'appointment instructions')
  isPdf(await pdf.generateRateSheet(await inputs.rateSheetInputs()), 'rate sheet')

  const assay = await inputs.assayResultsInputs(order_id)
  isPdf(await pdf.generateAssayResults(assay), 'assay results')
}, 120_000)
