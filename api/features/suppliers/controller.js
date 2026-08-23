import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as supplierService from "#features/suppliers/service.js"

export const getAllSuppliers = asyncHandler(async (req, res) => {
  const suppliers = await supplierService.getAllSuppliers();
  return res.json(suppliers);
});
