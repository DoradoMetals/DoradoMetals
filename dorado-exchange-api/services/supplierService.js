import * as supplierRepo from "../repositories/supplierRepo.js";

export async function getAllSuppliers() {
  return await supplierRepo.getAllSuppliers();
}

export async function getSupplierFromId(ids) {
  return await supplierRepo.getSupplierFromId(id);
}

