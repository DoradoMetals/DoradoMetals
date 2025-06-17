const supplierRepo = require("../repositories/supplierRepo");

async function getAllSuppliers() {
  return await supplierRepo.getAllSuppliers();
}

async function getSupplierFromId(ids) {
  return await supplierRepo.getSupplierFromId(id);
}

module.exports = {
  getAllSuppliers,
  getSupplierFromId,
};
