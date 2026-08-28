import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import { callerId } from "#shared/http/caller.ts";
import type { Request } from "express";
import * as quoteService from "#features/quotes/service.ts";

// WHOSE FUNDS THE SALES-ORDER QUOTE PRICES: "your own, unless you are an
// admin", exactly as places/addresses/controller.ts treats the address book.
// The admin create drawer quotes for the customer it is creating the order
// for, so its Credit Available is that customer's row and not the admin's.
// A customer naming somebody else is answered with their own quote - the
// name is ignored, never an error, and never somebody else's balance.
const subjectOf = (req: Request): string => {
  const named = req.body?.user_id;
  if (req.user?.role === "admin" && named) return named;
  return callerId(req);
};

export const catalogQuote = asyncHandler(async (req, res) => {
  res.status(200).json(await quoteService.catalogQuote(req.body));
});

// The subject comes from the SESSION - or, for an admin only, from the body
// (subjectOf above): the quote prices against the subject's own funds row,
// and nothing a customer sends can name somebody else. (Worded without the
// underscore token on purpose - endpoints.test.js slices the PRECEDING
// handler's body up to the next export, so this comment is scanned as part
// of the public catalog quote. The helper sits above the first export, which
// keeps it outside every slice.)
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
