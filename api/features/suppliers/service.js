import * as supplierRepo from "#features/suppliers/repo.js"

export async function getAllSuppliers() {
  return await supplierRepo.getAllSuppliers();
}

// Took `ids` and passed `id`, which was never defined - a ReferenceError on
// every call. Renamed to match what the repo actually wants: one id.
export async function getSupplierFromId(id) {
  return await supplierRepo.getSupplierFromId(id);
}

