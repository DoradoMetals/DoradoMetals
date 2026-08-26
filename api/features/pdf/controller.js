import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as pdfService from "#features/pdf/service.ts";

const sendPdf = (res, pdf, filename) => {
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": pdf.length,
  });
  res.end(pdf);
};

export const generatePackingList = asyncHandler(async (req, res) => {
  const pdf = await pdfService.generatePackingList(req.body);
  sendPdf(res, pdf, "packing-list.pdf");
});

export const generateReturnPackingList = asyncHandler(async (req, res) => {
  const pdf = await pdfService.generateReturnPackingList(req.body);
  sendPdf(res, pdf, "return-packing-list.pdf");
});

export const generateInvoice = asyncHandler(async (req, res) => {
  const pdf = await pdfService.generateInvoice(req.body);
  sendPdf(res, pdf, "invoice.pdf");
});

export const generateSalesOrderInvoice = asyncHandler(async (req, res) => {
  const pdf = await pdfService.generateSalesOrderInvoice(req.body);
  sendPdf(res, pdf, "invoice.pdf");
});
