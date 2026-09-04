import { GetSalesTaxBody } from "@dorado/contracts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { parseStrict } from "#shared/http/validate.ts";
import * as taxService from "#domain/sales-tax/service.ts";

export const getSalesTax = asyncHandler(async (req, res) => {
  const body = parseStrict(GetSalesTaxBody, req.body, "tax body");
  return res.json(await taxService.getSalesTax(body));
});
