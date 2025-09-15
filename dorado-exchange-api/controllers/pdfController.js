import * as pdfRepo from "../repositories/pdfRepo.js";

export async function generatePackingList(req, res, next) {
  try {
    const pdf = await pdfRepo.generatePackingList(req.body);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="packing-list.pdf"',
      "Content-Length": pdf.length,
    });

    res.end(pdf);
  } catch (err) {
    return next(err);
  }
}

export async function generateReturnPackingList(req, res, next) {
  try {
    const pdf = await pdfRepo.generateReturnPackingList(req.body);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="packing-list.pdf"',
      "Content-Length": pdf.length,
    });

    res.end(pdf);
  } catch (err) {
    return next(err);
  }
}

export async function generateInvoice(req, res, next) {
  try {
    const pdf = await pdfRepo.generateInvoice(req.body);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="packing-list.pdf"',
      "Content-Length": pdf.length,
    });

    res.end(pdf);
  } catch (err) {
    return next(err);
  }
}

export async function generateSalesOrderInvoice(req, res, next) {
  try {
    const pdf = await pdfRepo.generateSalesOrderInvoice(req.body);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="packing-list.pdf"',
      "Content-Length": pdf.length,
    });

    res.end(pdf);
  } catch (err) {
    return next(err);
  }
}
