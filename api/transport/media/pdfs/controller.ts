import type { Response } from "express";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as pdfService from "#domain/media/pdfs/service.ts";
import { serveOrderDocument } from "#domain/media/pdfs/serve.ts";
import * as inputs from "#domain/media/pdfs/order-inputs.ts";

// The headers are the same whichever truth answered - a stored file and a
// fresh render are both "a PDF the browser must save under this name", and
// the filenames are the ones the frontend has always received.
const sendPdf = (res: Response, pdf: Uint8Array, filename: string) => {
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": pdf.length,
  });
  res.end(pdf);
};

// Each route serves the STORED document when one exists and the caller owns
// the order (or is an admin) - "one render, one truth", see serve.ts - and
// falls back to a LIVE RENDER FROM THE SERVER'S OWN READ.
//
// THE BODY IS `{ order_id }` (ruling 10, wave 3). It was the whole composed
// order plus the spot feed plus the package and payout options, so a live
// render produced a document out of numbers the browser supplied - the last
// of the four violations ruling 10 listed, and no longer optional once the
// order wire slimmed and the browser stopped having a composed order to send.
// features/media/pdfs/order-inputs.ts loads what each template needs.
//
// serve.ts still treats the id as untrusted until orderOwnedBy has answered,
// which is what guards these routes - they carry requireUser only.

export const generatePackingList = asyncHandler(async (req, res) => {
  const { bytes } = await serveOrderDocument({
    kind: "packing_list",
    order_id: req.body?.order_id,
    caller: req.user,
    render: async () => pdfService.generatePackingList(await inputs.packingListInputs(req.body?.order_id)),
  });
  sendPdf(res, bytes, "packing-list.pdf");
});

export const generateReturnPackingList = asyncHandler(async (req, res) => {
  const { bytes } = await serveOrderDocument({
    kind: "return_packing_list",
    order_id: req.body?.order_id,
    caller: req.user,
    render: async () => pdfService.generateReturnPackingList(await inputs.returnPackingListInputs(req.body?.order_id)),
  });
  sendPdf(res, bytes, "return-packing-list.pdf");
});

export const generateInvoice = asyncHandler(async (req, res) => {
  const { bytes } = await serveOrderDocument({
    kind: "invoice",
    order_id: req.body?.order_id,
    caller: req.user,
    render: async () => pdfService.generateInvoice(await inputs.invoiceInputs(req.body?.order_id)),
  });
  sendPdf(res, bytes, "invoice.pdf");
});

export const generateSalesOrderInvoice = asyncHandler(async (req, res) => {
  const { bytes } = await serveOrderDocument({
    kind: "sales_order_invoice",
    order_id: req.body?.order_id,
    caller: req.user,
    render: async () => pdfService.generateSalesOrderInvoice(
      await inputs.salesOrderInvoiceInputs(req.body?.order_id)
    ),
  });
  sendPdf(res, bytes, "invoice.pdf");
});
