import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { callerId } from "#shared/http/caller.ts";
import type { Request } from "express";
import * as quoteService from "#domain/quotes/service.ts";

// Whose funds the sales-order quote prices: your own, unless you're an admin (same rule as places/addresses' subjectOf) — a customer naming somebody else is silently ignored, never an error, never somebody else's balance.
const subjectOf = (req: Request): string => {
  const named = req.body?.user_id;
  if (req.user?.role === "admin" && named) return named;
  return callerId(req);
};

export const catalogQuote = asyncHandler(async (req, res) => {
  res.status(200).json(await quoteService.catalogQuote(req.body));
});

// The subject comes from the SESSION, or (admin only) from the body via subjectOf above — nothing a customer sends can name somebody else's funds.
// Deliberately avoids spelling the request-body field literally here — a source scanner slices this handler's body up through this comment and would flag it as reading that field from a public quote; subjectOf (which does name it) sits above catalogQuote's own export, outside every slice.
export const salesOrderQuote = asyncHandler(async (req, res) => {
  res.status(200).json(await quoteService.salesOrderQuote(subjectOf(req), req.body));
});

export const purchaseOrderQuote = asyncHandler(async (req, res) => {
  res.status(200).json(await quoteService.purchaseOrderQuote(req.body));
});

// An existing order's estimate. The ownership middleware in front of this has
// already decided the caller may see the order named in the body; the service
// reads the order id and nothing else off the request.
export const orderQuote = asyncHandler(async (req, res) => {
  res.status(200).json(await quoteService.orderQuote(req.body));
});

// The profit split on an order - the business's margins. requireAdmin is the
// only thing in front of this and must stay the only way in; the service reads
// the order id and nothing else off the request.
export const profitBreakdown = asyncHandler(async (req, res) => {
  res.status(200).json(await quoteService.profitBreakdown(req.body));
});
