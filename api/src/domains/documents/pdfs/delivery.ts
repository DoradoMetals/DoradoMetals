import * as orders from '#orders/service.ts'
import * as refining from '#refining/service.ts'
import * as emails from '#documents/emails/service.ts'
import * as inputs from '#documents/pdfs/order-inputs.ts'
import * as pdfService from '#documents/pdfs/service.ts'
import * as rules from '#documents/pdfs/rules.ts'
import { latestPdf, storeUpload } from '#documents/pdfs/store.ts'
import { storedBytes } from '#documents/pdfs/serve.ts'
import type { OrderDocument, PdfKind } from '@dorado/contracts'

async function rendered(kind: PdfKind, order_id: string): Promise<Uint8Array | null> {
  if (kind === 'packing_list') {
    return await pdfService.generatePackingList(await inputs.packingListInputs(order_id))
  }
  if (kind === 'return_packing_list') {
    return await pdfService.generateReturnPackingList(
      await inputs.returnPackingListInputs(order_id)
    )
  }
  if (kind === 'invoice' || kind === 'sales_order_invoice') {
    return await pdfService.generateInvoice(await inputs.invoiceInputs(order_id))
  }
  if (kind === 'pickup_manifest') {
    return await pdfService.generatePickupManifest(await inputs.pickupManifestInputs(order_id))
  }
  if (kind === 'intake_receipt') {
    return await pdfService.generateIntakeReceipt(await inputs.intakeReceiptInputs(order_id))
  }
  if (kind === 'shipping_instructions') {
    return await pdfService.generateShippingInstructions(await inputs.referenceInputs(order_id))
  }
  if (kind === 'pickup_instructions') {
    return await pdfService.generatePickupInstructions(await inputs.referenceInputs(order_id))
  }
  if (kind === 'appointment_instructions') {
    return await pdfService.generateAppointmentInstructions(await inputs.referenceInputs(order_id))
  }
  if (kind === 'assay_results') {
    return await pdfService.generateAssayResults(await inputs.assayResultsInputs(order_id))
  }
  return null
}

// An imported file wins over a rendered one: it is what somebody actually sent
// us, and for the six kinds with no renderer it is the only copy there is.
async function bytesForOrder(order_id: string, document: OrderDocument): Promise<Uint8Array> {
  const stored = document.pdf_id ? await latestPdf(document.kind, order_id) : null
  const bytes =
    (stored ? await storedBytes(stored) : null) ?? (await rendered(document.kind, order_id))
  rules.assertRendered(bytes, document.name)
  return bytes
}

export async function sendOrderDocument(order_id: string, kind: PdfKind): Promise<OrderDocument> {
  const document = (await orders.documentsFor(order_id)).find((row) => row.kind === kind)
  rules.assertDocumentAvailable(document, kind)
  const bytes = await bytesForOrder(order_id, document)
  await emails.sendDocument(order_id, document.name, bytes, document.pdf_id)
  return document
}

export async function importOrderDocument(
  order_id: string,
  kind: PdfKind,
  bytes: Uint8Array | null
): Promise<OrderDocument> {
  rules.assertUpload(bytes)
  await storeUpload(kind, order_id, null, bytes)
  const written = (await orders.documentsFor(order_id)).find((row) => row.kind === kind)
  rules.assertDocumentAvailable(written, kind)
  return written
}

// The refiner side. Nothing is emailed - a refiner is not a customer and the
// mailers are the customer's (ruling 15) - so the only thing a refiner order's
// Documents card does is hold what came back from them.
export async function importRefiningDocument(
  refining_order_id: string,
  kind: PdfKind,
  bytes: Uint8Array | null
): Promise<OrderDocument> {
  rules.assertUpload(bytes)
  // 404s an unknown refiner order before a single byte reaches storage.
  await refining.documentsFor(refining_order_id)
  await storeUpload(kind, null, refining_order_id, bytes)
  const written = (await refining.documentsFor(refining_order_id)).find((row) => row.kind === kind)
  rules.assertDocumentAvailable(written, kind)
  return written
}
