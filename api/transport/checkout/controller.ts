// HTTP in, HTTP out. Bodies are parsed strictly against the contract.
import { checkout, orders } from "@dorado/contracts";
import type { Request } from "express";
import { callerId } from "#shared/http/caller.ts";
import { oneString } from "#shared/http/query.ts";
import { parseStrict } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as cartService from "#domain/checkout/service.ts";

// The caller's own row, unless an admin names somebody else's (?user_id=).
function subjectOf(req: Request): Promise<string> {
  const named = req.query?.user_id ?? req.body?.user_id;
  return cartService.resolveSubject(
    callerId(req), req.user?.role === "admin", oneString(named)
  );
}

// ---------------------------------------------------------------- the basket

export const getCheckoutItems = asyncHandler(async (req, res) => {
  const direction = parseStrict(orders.enums.Direction, oneString(req.query.direction), "direction");
  return res.status(200).json(
    await cartService.listItems(await subjectOf(req), direction)
  );
});

// The sync: replaces the basket, answers what is now in it.
export const putCheckoutItems = asyncHandler(async (req, res) => {
  const direction = parseStrict(orders.enums.Direction, oneString(req.query.direction), "direction");
  const body = parseStrict(checkout.items.SyncBody, req.body, "checkout/items body");
  return res.status(200).json(
    await cartService.replaceItems(await subjectOf(req), direction, body.items)
  );
});

export const deleteCheckoutItems = asyncHandler(async (req, res) => {
  const direction = parseStrict(orders.enums.Direction, oneString(req.query.direction), "direction");
  const removed = await cartService.clearItems(await subjectOf(req), direction);
  return res.status(200).json({ removed });
});

// ----------------------------------------------------------- the row (D208)

// GET /api/checkout?direction=sale|purchase(&user_id= admin-only) - the
// customer's checkout row, created on first read, with its draft fulfillment
// composed on.
export const getCheckout = asyncHandler(async (req, res) => {
  const direction = parseStrict(orders.enums.Direction, oneString(req.query.direction), "direction");
  const subject = await subjectOf(req);
  return res.status(200).json(await cartService.getCheckout(subject, direction));
});

// PATCH /api/checkout(?user_id= admin-only) - the id columns a customer may
// write. The schema is the whitelist: fulfillment_id, user_id and the payout
// pointers are not in it, so a BODY cannot name them - naming a different
// customer is a query param, checked the same way the GET is.
export const patchCheckout = asyncHandler(async (req, res) => {
  const body = parseStrict(checkout.checkouts.PatchBody, req.body, "checkout PATCH body");
  // The columns, parsed out of the body: a plain object schema strips
  // `direction`, which names the session rather than a column of it.
  const patch = checkout.checkouts.Patch.parse(body);
  const subject = await subjectOf(req);
  return res.status(200).json(
    await cartService.patchCheckout(subject, body.direction, patch)
  );
});

// POST /api/checkout/fulfillment - ensure the draft fulfillment and set its
// method; the row keeps the draft's id.
export const setCheckoutFulfillment = asyncHandler(async (req, res) => {
  const body = parseStrict(
    checkout.checkouts.FulfillmentBody, req.body, "checkout/fulfillment body"
  );
  const result = await cartService.setFulfillmentMethod(
    callerId(req), body.direction, body.method_id, body.handoff_code
  );
  return res.status(200).json(result);
});

// POST /api/checkout/payout - the payout step's write (D210). The numbers are
// sealed at rest by payments/details; the response carries only last_four.
export const saveCheckoutPayout = asyncHandler(async (req, res) => {
  const body = parseStrict(checkout.checkouts.PayoutBody, req.body, "checkout/payout body");
  const form = checkout.checkouts.PayoutForm.parse(body);
  return res.status(200).json(
    await cartService.saveCheckoutPayout(callerId(req), body.direction, form)
  );
});
