import type { Response } from "express";
import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as pdfService from "#features/media/pdfs/service.ts";
import { serveOrderDocument } from "#features/media/pdfs/serve.ts";

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
// falls back to rendering the request body live, which is everything these
// routes did before the paper trail.
//
// The order id is read off the body under the spelling each body uses
// (`purchaseOrder` / `salesOrder` - the reason requireOwnOrder never guarded
// these routes), and serve.ts treats it as untrusted until orderOwnedBy has
// answered.

export const generatePackingList = asyncHandler(async (req, res) => {
  const { bytes } = await serveOrderDocument({
    kind: "packing_list",
    order_id: req.body?.purchaseOrder?.id,
    caller: req.user,
    render: () => pdfService.generatePackingList(req.body),
  });
  sendPdf(res, bytes, "packing-list.pdf");
});

export const generateReturnPackingList = asyncHandler(async (req, res) => {
  const { bytes } = await serveOrderDocument({
    kind: "return_packing_list",
    order_id: req.body?.purchaseOrder?.id,
    caller: req.user,
    render: () => pdfService.generateReturnPackingList(req.body),
  });
  sendPdf(res, bytes, "return-packing-list.pdf");
});

export const generateInvoice = asyncHandler(async (req, res) => {
  const { bytes } = await serveOrderDocument({
    kind: "invoice",
    order_id: req.body?.purchaseOrder?.id,
    caller: req.user,
    render: () => pdfService.generateInvoice(req.body),
  });
  sendPdf(res, bytes, "invoice.pdf");
});

export const generateSalesOrderInvoice = asyncHandler(async (req, res) => {
  const { bytes } = await serveOrderDocument({
    kind: "sales_order_invoice",
    order_id: req.body?.salesOrder?.id,
    caller: req.user,
    render: () => pdfService.generateSalesOrderInvoice(req.body),
  });
  sendPdf(res, bytes, "invoice.pdf");
});
