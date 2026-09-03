// HTTP in, HTTP out. Every body is parsed against the contract's own schema,
// in STRICT mode, before the service runs.
//
// THE CART BELONGS TO THE SESSION, NOT TO WHOEVER NAMES A USER. These four
// took the user id out of the request and the routes were unauthenticated, so
// an anonymous caller with somebody's user id could read their sell cart and
// replace it - demonstrated, not deduced. The id comes from req.user now and
// the request's own `user_id` is accepted and ignored, so an older client is
// not answered 400.
import {
  SyncCartBody, SyncSellCartBody, CheckoutPatchBody, CheckoutPatchColumns,
  CheckoutFulfillmentBody, CheckoutPayoutBody, CheckoutPayoutForm,
} from "@dorado/contracts";
import { callerId } from "#shared/http/caller.ts";
import { oneString } from "#shared/http/query.ts";
import { parseStrict } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as cartService from "#domain/checkout/service.ts";

// RETURNS THE CART. It used to run the query and answer `{ success: true }`,
// so a signed-in customer's saved buy cart never came back and hydration threw
// a TypeError on every login.
export const getCart = asyncHandler(async (req, res) => {
  return res.status(200).json(await cartService.getCart(callerId(req), "sale"));
});

export const syncCart = asyncHandler(async (req, res) => {
  const body = parseStrict(SyncCartBody, req.body, "cart/sync_cart body");
  await cartService.syncCart(callerId(req), "sale", body.cart);
  return res.status(200).json({ message: "Cart synced successfully" });
});

export const getSellCart = asyncHandler(async (req, res) => {
  return res.status(200).json(await cartService.getCart(callerId(req), "purchase"));
});

export const syncSellCart = asyncHandler(async (req, res) => {
  const body = parseStrict(SyncSellCartBody, req.body, "cart/sync_sell_cart body");
  await cartService.syncCart(callerId(req), "purchase", body.cart);
  return res.status(200).json({ message: "Sell cart synced successfully" });
});

// ----------------------------------------------------------- the row (D208)

// GET /api/checkout?direction=sale|purchase - the customer's checkout row,
// created on first read, with its draft fulfillment composed on.
export const getCheckout = asyncHandler(async (req, res) => {
  const result = await cartService.getCheckout(callerId(req), oneString(req.query.direction));
  return res.status(200).json(result);
});

// PATCH /api/checkout - the id columns a customer may write. The schema is the
// whitelist: fulfillment_id and the payout pointers are not in it, so a request
// cannot name them.
export const patchCheckout = asyncHandler(async (req, res) => {
  const body = parseStrict(CheckoutPatchBody, req.body, "checkout PATCH body");
  // The columns, parsed out of the body: a plain object schema strips
  // `direction`, which names the session rather than a column of it.
  const patch = CheckoutPatchColumns.parse(body);
  return res.status(200).json(
    await cartService.patchCheckout(callerId(req), body.direction, patch)
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
