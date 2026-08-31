import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as taxService from "#features/sales-tax/service.ts"

export const getSalesTax = asyncHandler(async (req, res) => {
  const tax = await taxService.getSalesTax(req.body);
  return res.json(tax);
});
