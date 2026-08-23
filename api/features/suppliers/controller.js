// Responses go out through toWire, which renames organizations' `enabled` back
// to the `is_active` the frontend reads. SUPPLIERS_WIRE=next turns it off.
import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as supplierService from "#features/suppliers/service.js"
import { toWire } from "#features/suppliers/wire.js";

export const getAllSuppliers = asyncHandler(async (req, res) => {
  const suppliers = await supplierService.getAllSuppliers();
  return res.json(toWire(suppliers));
});
