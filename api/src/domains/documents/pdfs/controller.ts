import { z } from 'zod/v4'
import type { Request, Response } from 'express'
import { PdfKind } from '@dorado/contracts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { parseStrict, uuidLike, uuidParam } from '#shared/http/validate.ts'
import { param } from '#shared/http/caller.ts'
import { firstFile } from '#shared/http/multipart.ts'
import * as delivery from '#documents/pdfs/delivery.ts'
import * as pdfService from '#documents/pdfs/service.ts'
import { serveOrderDocument } from '#documents/pdfs/serve.ts'
import * as inputs from '#documents/pdfs/order-inputs.ts'

const OrderIdBody = z.object({ order_id: uuidLike }).strict()

const sendPdf = (res: Response, pdf: Uint8Array, filename: string) => {
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': pdf.length,
  })
  res.end(pdf)
}

const orderId = (req: Request, label: string) =>
  parseStrict(OrderIdBody, req.body, `media/pdfs/${label} body`).order_id

export const generatePackingList = asyncHandler(async (req, res) => {
  const order_id = orderId(req, 'generate_packing_list')
  const { bytes } = await serveOrderDocument({
    kind: 'packing_list',
    order_id,
    caller: req.user,
    render: async () => pdfService.generatePackingList(await inputs.packingListInputs(order_id)),
  })
  sendPdf(res, bytes, 'packing-list.pdf')
})

export const generateReturnPackingList = asyncHandler(async (req, res) => {
  const order_id = orderId(req, 'generate_return_packing_list')
  const { bytes } = await serveOrderDocument({
    kind: 'return_packing_list',
    order_id,
    caller: req.user,
    render: async () =>
      pdfService.generateReturnPackingList(await inputs.returnPackingListInputs(order_id)),
  })
  sendPdf(res, bytes, 'return-packing-list.pdf')
})

export const generateInvoice = asyncHandler(async (req, res) => {
  const order_id = orderId(req, 'generate_invoice')
  const { bytes } = await serveOrderDocument({
    kind: 'invoice',
    order_id,
    caller: req.user,
    render: async () => pdfService.generateInvoice(await inputs.invoiceInputs(order_id)),
  })
  sendPdf(res, bytes, 'invoice.pdf')
})

export const generateSalesOrderInvoice = asyncHandler(async (req, res) => {
  const order_id = orderId(req, 'generate_sales_order_invoice')
  const { bytes } = await serveOrderDocument({
    kind: 'sales_order_invoice',
    order_id,
    caller: req.user,
    render: async () => pdfService.generateInvoice(await inputs.invoiceInputs(order_id)),
  })
  sendPdf(res, bytes, 'invoice.pdf')
})

export const generatePickupManifest = asyncHandler(async (req, res) => {
  const order_id = orderId(req, 'generate_pickup_manifest')
  const { bytes } = await serveOrderDocument({
    kind: 'pickup_manifest',
    order_id,
    caller: req.user,
    render: async () =>
      pdfService.generatePickupManifest(await inputs.pickupManifestInputs(order_id)),
  })
  sendPdf(res, bytes, 'pickup-manifest.pdf')
})

export const generateIntakeReceipt = asyncHandler(async (req, res) => {
  const order_id = orderId(req, 'generate_intake_receipt')
  const { bytes } = await serveOrderDocument({
    kind: 'intake_receipt',
    order_id,
    caller: req.user,
    render: async () =>
      pdfService.generateIntakeReceipt(await inputs.intakeReceiptInputs(order_id)),
  })
  sendPdf(res, bytes, 'intake-receipt.pdf')
})

export const generateShippingInstructions = asyncHandler(async (req, res) => {
  const order_id = orderId(req, 'generate_shipping_instructions')
  const { bytes } = await serveOrderDocument({
    kind: 'shipping_instructions',
    order_id,
    caller: req.user,
    render: async () =>
      pdfService.generateShippingInstructions(await inputs.referenceInputs(order_id)),
  })
  sendPdf(res, bytes, 'shipping-instructions.pdf')
})

export const generatePickupInstructions = asyncHandler(async (req, res) => {
  const order_id = orderId(req, 'generate_pickup_instructions')
  const { bytes } = await serveOrderDocument({
    kind: 'pickup_instructions',
    order_id,
    caller: req.user,
    render: async () =>
      pdfService.generatePickupInstructions(await inputs.referenceInputs(order_id)),
  })
  sendPdf(res, bytes, 'pickup-instructions.pdf')
})

export const generateAppointmentInstructions = asyncHandler(async (req, res) => {
  const order_id = orderId(req, 'generate_appointment_instructions')
  const { bytes } = await serveOrderDocument({
    kind: 'appointment_instructions',
    order_id,
    caller: req.user,
    render: async () =>
      pdfService.generateAppointmentInstructions(await inputs.referenceInputs(order_id)),
  })
  sendPdf(res, bytes, 'appointment-instructions.pdf')
})

export const generateAssayResults = asyncHandler(async (req, res) => {
  const order_id = orderId(req, 'generate_assay_results')
  const { bytes } = await serveOrderDocument({
    kind: 'assay_results',
    order_id,
    caller: req.user,
    render: async () => pdfService.generateAssayResults(await inputs.assayResultsInputs(order_id)),
  })
  sendPdf(res, bytes, 'assay-results.pdf')
})

export const generateRateSheet = asyncHandler(async (_req, res) => {
  const bytes = await pdfService.generateRateSheet(await inputs.rateSheetInputs())
  sendPdf(res, bytes, 'rate-sheet.pdf')
})

const kindParam = (req: Request): PdfKind =>
  parseStrict(PdfKind, param(req, 'kind'), 'document kind')

export const sendOrderDocument = asyncHandler(async (req, res) => {
  const sent = await delivery.sendOrderDocument(uuidParam(req, 'id'), kindParam(req))
  return res.status(200).json(sent)
})

export const importOrderDocument = asyncHandler(async (req, res) => {
  const file = firstFile(req.get('content-type') ?? '', req.body)
  const written = await delivery.importOrderDocument(
    uuidParam(req, 'id'),
    kindParam(req),
    file?.bytes ?? null
  )
  return res.status(201).json(written)
})

export const importRefiningDocument = asyncHandler(async (req, res) => {
  const file = firstFile(req.get('content-type') ?? '', req.body)
  const written = await delivery.importRefiningDocument(
    uuidParam(req, 'id'),
    kindParam(req),
    file?.bytes ?? null
  )
  return res.status(201).json(written)
})
