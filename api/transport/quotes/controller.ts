import {
  CatalogQuoteBody, OrderQuoteBody, PurchaseOrderQuoteBody, SalesOrderQuoteBody,
} from "@dorado/contracts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { callerId } from "#shared/http/caller.ts";
import { parseStrict } from "#shared/http/validate.ts";
import * as quoteService from "#domain/quotes/service.ts";
import * as profitService from "#domain/quotes/profit.ts";
import type { Request } from "express";
import type { SalesOrderQuoteBody as SalesOrderQuoteBodyType } from "@dorado/contracts";

// Whose funds the sales-order quote prices: your own, unless you are an admin
// (the same rule as places/addresses' subjectOf) - a customer naming somebody
// else is silently ignored, never an error, never somebody else's balance.
const subjectOf = (req: Request, body: SalesOrderQuoteBodyType): string =>
  req.user?.role === "admin" && body.user_id ? body.user_id : callerId(req);

export const catalogQuote = asyncHandler(async (req, res) => {
  const body = parseStrict(CatalogQuoteBody, req.body, "quotes/catalog body");
  res.status(200).json(await quoteService.catalogQuote(body));
});

export const salesOrderQuote = asyncHandler(async (req, res) => {
  const body = parseStrict(SalesOrderQuoteBody, req.body, "quotes/sales_order body");
  res.status(200).json(await quoteService.salesOrderQuote(subjectOf(req, body), body));
});

export const purchaseOrderQuote = asyncHandler(async (req, res) => {
  const body = parseStrict(PurchaseOrderQuoteBody, req.body, "quotes/purchase_order body");
  res.status(200).json(await quoteService.purchaseOrderQuote(body));
});

// An existing order's estimate. The ownership middleware in front of this has
// already decided the caller may see the order named in the body.
export const orderQuote = asyncHandler(async (req, res) => {
  const body = parseStrict(OrderQuoteBody, req.body, "quotes/order body");
  res.status(200).json(await quoteService.orderQuote(body));
});

// The profit split on an order - the business's margins. requireAdmin is the
// only thing in front of this and must stay the only way in.
export const profitBreakdown = asyncHandler(async (req, res) => {
  const body = parseStrict(OrderQuoteBody, req.body, "quotes/profit_breakdown body");
  res.status(200).json(await profitService.profitBreakdown(body));
});
