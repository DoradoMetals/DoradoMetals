import { z } from "zod/v4";
import type { Response } from "express";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { parseStrict, uuidLike } from "#shared/http/validate.ts";
import * as pdfService from "#domain/media/pdfs/service.ts";
import { serveOrderDocument } from "#domain/media/pdfs/serve.ts";
import * as inputs from "#domain/media/pdfs/order-inputs.ts";

const OrderIdBody = z.object({ order_id: uuidLike }).strict();

// The headers are the same whichever truth answered - stored or fresh render, both are "a PDF the browser must save under this name", and the filenames are the ones the frontend has always received.
const sendPdf = (res: Response, pdf: Uint8Array, filename: string) => {
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": pdf.length,
  });
  res.end(pdf);
};

// Each route serves the STORED document when one exists and the caller owns the order (or is an admin) - "one render, one truth", see serve.ts - falling back to a LIVE RENDER FROM THE SERVER'S OWN READ.
// The body is `{ order_id }` - order-inputs.ts loads what each template needs; serve.ts still treats the id as untrusted until orderOwnedBy has answered, which is what guards these routes (requireUser only).

export const generatePackingList = asyncHandler(async (req, res) => {
  const { order_id } = parseStrict(OrderIdBody, req.body, "media/pdfs/generate_packing_list body");
  const { bytes } = await serveOrderDocument({
    kind: "packing_list",
    order_id,
    caller: req.user,
    render: async () => pdfService.generatePackingList(await inputs.packingListInputs(order_id)),
  });
  sendPdf(res, bytes, "packing-list.pdf");
});

export const generateReturnPackingList = asyncHandler(async (req, res) => {
  const { order_id } = parseStrict(OrderIdBody, req.body, "media/pdfs/generate_return_packing_list body");
  const { bytes } = await serveOrderDocument({
    kind: "return_packing_list",
    order_id,
    caller: req.user,
    render: async () => pdfService.generateReturnPackingList(await inputs.returnPackingListInputs(order_id)),
  });
  sendPdf(res, bytes, "return-packing-list.pdf");
});

export const generateInvoice = asyncHandler(async (req, res) => {
  const { order_id } = parseStrict(OrderIdBody, req.body, "media/pdfs/generate_invoice body");
  const { bytes } = await serveOrderDocument({
    kind: "invoice",
    order_id,
    caller: req.user,
    render: async () => pdfService.generateInvoice(await inputs.invoiceInputs(order_id)),
  });
  sendPdf(res, bytes, "invoice.pdf");
});

export const generateSalesOrderInvoice = asyncHandler(async (req, res) => {
  const { order_id } = parseStrict(OrderIdBody, req.body, "media/pdfs/generate_sales_order_invoice body");
  const { bytes } = await serveOrderDocument({
    kind: "sales_order_invoice",
    order_id,
    caller: req.user,
    render: async () => pdfService.generateSalesOrderInvoice(
      await inputs.salesOrderInvoiceInputs(order_id)
    ),
  });
  sendPdf(res, bytes, "invoice.pdf");
});
