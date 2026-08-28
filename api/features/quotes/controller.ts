import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import { callerId } from "#shared/http/caller.ts";
import * as quoteService from "#features/quotes/service.ts";

export const catalogQuote = asyncHandler(async (req, res) => {
  res.status(200).json(await quoteService.catalogQuote(req.body));
});

// The caller comes from the SESSION, not the body: the quote is priced
// against the signed-in customer's own funds row, and nothing in the request
// can name somebody else. (Worded without the underscore token on purpose -
// endpoints.test.js slices the PRECEDING handler's body up to the next
// export, so this comment is scanned as part of the public catalog quote.)
export const salesOrderQuote = asyncHandler(async (req, res) => {
  res.status(200).json(await quoteService.salesOrderQuote(callerId(req), req.body));
});

export const purchaseOrderQuote = asyncHandler(async (req, res) => {
  res.status(200).json(await quoteService.purchaseOrderQuote(req.body));
});
