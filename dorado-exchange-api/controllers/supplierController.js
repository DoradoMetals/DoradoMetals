const supplierService = require("../services/supplierService");

async function getAllSuppliers(req, res) {
  try {
    const suppliers = await supplierService.getAllSuppliers();
    return res.json(suppliers);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getAllSuppliers,
};
