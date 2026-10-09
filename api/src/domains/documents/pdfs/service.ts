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
import { buildAssayResultsHtml } from '#documents/pdfs/render/documents/assay-results.ts'
import { storeUpload } from '#documents/pdfs/store.ts'
import type {
  AssayResultsDocument,
  DocumentInput,
  PdfKind,
  RateSheetDocument,
  ShipmentManifestInput,
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
  buildAssayResultsHtml,
}

export async function generateInvoice(input: DocumentInput): Promise<Uint8Array> {
  return renderPdf(buildInvoiceHtml(input))
}

export async function generatePackingList(input: ShipmentManifestInput): Promise<Uint8Array> {
  return renderPdf(buildPackingListHtml(input))
}

export async function generateReturnPackingList(input: ShipmentManifestInput): Promise<Uint8Array> {
  return renderPdf(buildReturnPackingListHtml(input))
}

export async function generatePickupManifest(input: DocumentInput): Promise<Uint8Array> {
  return renderPdf(buildPickupManifestHtml(input))
}

export async function generateIntakeReceipt(input: DocumentInput): Promise<Uint8Array> {
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

export async function generateAssayResults(input: AssayResultsDocument): Promise<Uint8Array> {
  return renderPdf(buildAssayResultsHtml(input))
}

export async function storeUnattachedUpload(kind: PdfKind, bytes: Uint8Array): Promise<string> {
  return await storeUpload(kind, null, null, bytes)
}
