import { GetSalesTaxBody } from "@dorado/contracts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { parseStrict } from "#shared/http/validate.ts";
import * as taxService from "#domain/sales-tax/service.ts";

// POST /api/tax/get_sales_tax - the body names an address and some products;
// every fact a tax rule matches on is read from their own rows.
export const getSalesTax = asyncHandler(async (req, res) => {
  const body = parseStrict(GetSalesTaxBody, req.body, "tax/get_sales_tax body");
  return res.json(await taxService.getSalesTax(body));
});
