import { CatalogQuoteBody, OrderQuoteBody, PurchaseOrderQuoteBody, SalesOrderQuoteBody } from "@dorado/contracts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { callerId } from "#shared/http/caller.ts";
import { parseStrict } from "#shared/http/validate.ts";
import * as quoteService from "#domain/quotes/service.ts";
import * as profitService from "#domain/quotes/profit.ts";
import type { Request } from "express";

const subjectOf = (req: Request, body: SalesOrderQuoteBody): string =>
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

export const orderQuote = asyncHandler(async (req, res) => {
  const body = parseStrict(OrderQuoteBody, req.body, "quotes/order body");
  res.status(200).json(await quoteService.orderQuote(body));
});

export const profitBreakdown = asyncHandler(async (req, res) => {
  const body = parseStrict(OrderQuoteBody, req.body, "quotes/profit_breakdown body");
  res.status(200).json(await profitService.profitBreakdown(body));
});
