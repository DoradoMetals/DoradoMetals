import { renderPdf } from '#documents/pdfs/render/puppeteer.ts'
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
import { buildQuoteEstimateHtml } from '#documents/pdfs/render/documents/quote-estimate.ts'
import { storeUpload } from '#documents/pdfs/store.ts'
import { storedBytes } from '#documents/pdfs/serve.ts'
import type { StoredReader } from '#documents/pdfs/serve.ts'
import * as pdfs from '#db/media/pdfs/repo.ts'
import * as rules from '#documents/pdfs/rules.ts'
import minio from '#providers/s3/minio.ts'
import type {
  DocumentInput,
  PdfKind,
  RateSheetDocument,
  ShipmentManifestInput,
  PartiesDocumentInput,
  QuoteEstimateInput,
} from '@dorado/contracts'

export {
  buildInvoiceHtml,
  buildPackingListHtml,
  buildReturnPackingListHtml,
  buildPickupManifestHtml,
  buildIntakeReceiptHtml,
  buildShippingInstructionsHtml,
  buildPickupInstructionsHtml,
  buildAppointmentInstructionsHtml,
  buildRateSheetHtml,
  buildQuoteEstimateHtml,
}

export async function generateInvoice(input: PartiesDocumentInput): Promise<Uint8Array> {
  return renderPdf(buildInvoiceHtml(input))
}

export async function generatePackingList(input: ShipmentManifestInput): Promise<Uint8Array> {
  return renderPdf(buildPackingListHtml(input))
}

export async function generateReturnPackingList(input: ShipmentManifestInput): Promise<Uint8Array> {
  return renderPdf(buildReturnPackingListHtml(input))
}

export async function generatePickupManifest(input: PartiesDocumentInput): Promise<Uint8Array> {
  return renderPdf(buildPickupManifestHtml(input))
}

export async function generateIntakeReceipt(input: PartiesDocumentInput): Promise<Uint8Array> {
  return renderPdf(buildIntakeReceiptHtml(input))
}

export async function generateShippingInstructions(reference: string): Promise<Uint8Array> {
  return renderPdf(buildShippingInstructionsHtml(reference))
}

export async function generatePickupInstructions(reference: string): Promise<Uint8Array> {
  return renderPdf(buildPickupInstructionsHtml(reference))
}

export async function generateAppointmentInstructions(reference: string): Promise<Uint8Array> {
  return renderPdf(buildAppointmentInstructionsHtml(reference))
}

export async function generateRateSheet(input: RateSheetDocument): Promise<Uint8Array> {
  return renderPdf(buildRateSheetHtml(input))
}

export async function generateQuoteEstimate(input: QuoteEstimateInput): Promise<Uint8Array> {
  return renderPdf(buildQuoteEstimateHtml(input))
}

export async function storeUnattachedUpload(kind: PdfKind, bytes: Uint8Array): Promise<string> {
  return await storeUpload(kind, null, null, bytes)
}

const URL_TTL_SECONDS = 60 * 60 * 24

export async function signedUrl(pdf_id: string): Promise<string> {
  const row = await pdfs.getOne(pdf_id)
  rules.assertStoredPdf(row, pdf_id)
  return await minio.presignedGetObject(process.env.S3_BUCKET as string, row.path, URL_TTL_SECONDS)
}

export async function bytesOf(pdf_id: string, storage?: StoredReader): Promise<Uint8Array> {
  const row = await pdfs.getOne(pdf_id)
  rules.assertStoredPdf(row, pdf_id)
  const bytes = await storedBytes(row, storage)
  rules.assertRendered(bytes, `pdf ${pdf_id}`)
  return bytes
}
