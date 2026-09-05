import { CatalogQuoteBody, Direction, OrderQuoteBody } from "@dorado/contracts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { callerId } from "#shared/http/caller.ts";
import { oneString } from "#shared/http/query.ts";
import { parseStrict } from "#shared/http/validate.ts";
import * as quoteService from "#domain/quotes/service.ts";
import * as checkoutService from "#domain/checkout/service.ts";
import * as profitService from "#domain/quotes/profit.ts";
import type { Request } from "express";

function subjectOf(req: Request): Promise<string> {
  return checkoutService.resolveSubject(
    callerId(req), req.user?.role === "admin", oneString(req.query.user_id)
  );
}

export const catalogQuote = asyncHandler(async (req, res) => {
  const body = parseStrict(CatalogQuoteBody, req.body, "quotes/catalog body");
  res.status(200).json(await quoteService.catalogQuote(body));
});

export const checkoutQuote = asyncHandler(async (req, res) => {
  const direction = parseStrict(Direction, oneString(req.query.direction), "direction");
  const subject = await subjectOf(req);
  res.status(200).json(await quoteService.checkoutQuote(subject, direction));
});

export const orderQuote = asyncHandler(async (req, res) => {
  const body = parseStrict(OrderQuoteBody, req.body, "quotes/order body");
  res.status(200).json(await quoteService.orderQuote(body));
});

export const profitBreakdown = asyncHandler(async (req, res) => {
  const body = parseStrict(OrderQuoteBody, req.body, "quotes/profit_breakdown body");
  res.status(200).json(await profitService.profitBreakdown(body));
});
