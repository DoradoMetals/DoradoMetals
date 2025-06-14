const pdfRepo = require("../repositories/pdfRepo");

const generatePackingList = async (req, res, next) => {
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
};

const generateReturnPackingList = async (req, res, next) => {
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
};

const generateInvoice = async (req, res, next) => {
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
};

const generateSalesOrderInvoice = async (req, res, next) => {
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
};

module.exports = {
  generatePackingList,
  generateReturnPackingList,
  generateInvoice,
  generateSalesOrderInvoice,
};
