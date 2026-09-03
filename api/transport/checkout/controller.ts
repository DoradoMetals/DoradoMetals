// HTTP in, HTTP out. Every body is parsed against the contract's own schema,
// in STRICT mode, before the service runs.
//
// THE CART BELONGS TO THE SESSION, NOT TO WHOEVER NAMES A USER - UNLESS THE
// CALLER IS AN ADMIN. These four took the user id out of the request and the
// routes were unauthenticated, so an anonymous caller with somebody's user id
// could read their sell cart and replace it - demonstrated, not deduced. The
// id comes from req.user now; a `user_id` naming the CALLER's own id is a
// no-op (so an older client that always sends its own is never refused), and
// one naming somebody else only resolves for an admin session
// (cartService.resolveSubject) - the admin sales-order create flow is what
// needs it, to sync and price a named customer's checkout ahead of order
// creation (see features/orders/salesOrders/admin/queries.ts).
import {
  SyncCartBody, SyncSellCartBody, CheckoutPatchBody, CheckoutPatchColumns,
  CheckoutFulfillmentBody, CheckoutPayoutBody, CheckoutPayoutForm,
} from "@dorado/contracts";
import type { Request } from "express";
import { callerId } from "#shared/http/caller.ts";
import { oneString } from "#shared/http/query.ts";
import { parseStrict } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as cartService from "#domain/checkout/service.ts";

// Which user's row/cart a request reaches: the caller's own, unless an admin
// names somebody else's - the same shape places/addresses/controller.ts's own
// `subjectOf` already uses. Takes the whole request, not an extracted field:
// GET/PATCH /checkout name it in the query (user_id is not a writable column,
// so it is never a body field there); the cart syncs already declare it in
// the body. cartService.resolveSubject is where the admin check and the
// existence check actually live.
function subjectOf(req: Request): Promise<string> {
  const named = req.query?.user_id ?? req.body?.user_id;
  return cartService.resolveSubject(
    callerId(req), req.user?.role === "admin", oneString(named)
  );
}

// RETURNS THE CART. It used to run the query and answer `{ success: true }`,
// so a signed-in customer's saved buy cart never came back and hydration threw
// a TypeError on every login.
export const getCart = asyncHandler(async (req, res) => {
  return res.status(200).json(await cartService.getCart(callerId(req), "sale"));
});

export const syncCart = asyncHandler(async (req, res) => {
  const body = parseStrict(SyncCartBody, req.body, "cart/sync_cart body");
  const subject = await subjectOf(req);
  await cartService.syncCart(subject, "sale", body.cart);
  return res.status(200).json({ message: "Cart synced successfully" });
});

export const getSellCart = asyncHandler(async (req, res) => {
  return res.status(200).json(await cartService.getCart(callerId(req), "purchase"));
});

export const syncSellCart = asyncHandler(async (req, res) => {
  const body = parseStrict(SyncSellCartBody, req.body, "cart/sync_sell_cart body");
  const subject = await subjectOf(req);
  await cartService.syncCart(subject, "purchase", body.cart);
  return res.status(200).json({ message: "Sell cart synced successfully" });
});

// ----------------------------------------------------------- the row (D208)

// GET /api/checkout?direction=sale|purchase(&user_id= admin-only) - the
// customer's checkout row, created on first read, with its draft fulfillment
// composed on.
export const getCheckout = asyncHandler(async (req, res) => {
  const subject = await subjectOf(req);
  const result = await cartService.getCheckout(subject, oneString(req.query.direction));
  return res.status(200).json(result);
});

// PATCH /api/checkout(?user_id= admin-only) - the id columns a customer may
// write. The schema is the whitelist: fulfillment_id, user_id and the payout
// pointers are not in it, so a BODY cannot name them - naming a different
// customer is a query param, checked the same way the GET is.
export const patchCheckout = asyncHandler(async (req, res) => {
  const body = parseStrict(CheckoutPatchBody, req.body, "checkout PATCH body");
  // The columns, parsed out of the body: a plain object schema strips
  // `direction`, which names the session rather than a column of it.
  const patch = CheckoutPatchColumns.parse(body);
  const subject = await subjectOf(req);
  return res.status(200).json(
    await cartService.patchCheckout(subject, body.direction, patch)
  );
});

// POST /api/checkout/fulfillment - ensure the draft fulfillment and set its
// method; the row keeps the draft's id.
export const setCheckoutFulfillment = asyncHandler(async (req, res) => {
  const body = parseStrict(
    CheckoutFulfillmentBody, req.body, "checkout/fulfillment body"
  );
  const result = await cartService.setFulfillmentMethod(
    callerId(req), body.direction, body.method_id, body.handoff_code
  );
  return res.status(200).json(result);
});

// POST /api/checkout/payout - the payout step's write (D210). The numbers are
// sealed at rest by payments/details; the response carries only last_four.
export const saveCheckoutPayout = asyncHandler(async (req, res) => {
  const body = parseStrict(CheckoutPayoutBody, req.body, "checkout/payout body");
  const form = CheckoutPayoutForm.parse(body);
  return res.status(200).json(
    await cartService.saveCheckoutPayout(callerId(req), body.direction, form)
  );
});
