import { callerId, requiredParam } from "#shared/http/caller.ts";
import { oneString } from "#shared/http/query.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as cartService from "#domain/checkout/service.ts";

// THE CART BELONGS TO THE SESSION, NOT TO WHOEVER NAMES A USER.
//
// These four took the user id out of the request - `oneString(req.query.user_id)` on the
// reads, `req.body.user_id` on the writes - and the routes were unauthenticated.
// So an anonymous caller with somebody's user id could read their sell cart and
// replace it. That was demonstrated, not deduced: a request with no session and
// no cookie returned another customer's cart, 200, two items.
//
// They were on the PUBLIC list in shared/http/endpoints.test.js with the reason
// "a cart belongs to a browser, not an account - a signed-out visitor has one".
// That is true of the browser-local store - zustand plus localStorage - and not
// of these endpoints: frontend/features/cart/queries.ts throws "Missing user"
// before calling either sync, and hydrateCarts only runs with a session's user
// id. Nothing has ever called them anonymously.
//
// The id now comes from req.user and the request's own is ignored, which is the
// same correction the order routes needed. It is transparent to the frontend,
// which was already sending its own id.
// RETURNS THE CART. It used to run the whole query and answer `{ success: true }`,
// discarding the result - so a signed-in customer's saved buy cart never came
// back. This was filed as D23, a product decision about whether a cart should
// follow somebody between devices. It is not one: the FRONTEND had already
// decided. `hydrateCarts` in features/auth/queries.ts types this response
// `Product[]` and hands it straight to `mergeCartItems`, whose `mergeCart` does
// `for (const item of cart)`. An object is not iterable, so hydration threw a
// TypeError on every login, and the try/catch around it turned that into a
// console.error nobody reads. The sell cart three lines below always returned
// its array, which is why only the buy cart was affected.
export const getCart = asyncHandler(async (req, res) => {
  const items = await cartService.getCart(callerId(req));
  return res.status(200).json(items);
});

export const syncCart = asyncHandler(async (req, res) => {
  await cartService.syncCart(callerId(req), req.body.cart);
  res.status(200).json({ message: "Cart synced successfully" });
});

export const getSellCart = asyncHandler(async (req, res) => {
  const items = await cartService.getSellCart(callerId(req));
  return res.status(200).json(items);
});

export const syncSellCart = asyncHandler(async (req, res) => {
  await cartService.syncSellCart(callerId(req), req.body.cart);
  return res.status(200).json({ message: "Sell cart synced successfully" });
});

// ----------------------------------------------------------- the row (D208)

// GET /api/checkout?direction=sale|purchase - the customer's checkout row,
// created on first read, with its draft fulfillment composed on.
export const getCheckout = asyncHandler(async (req, res) => {
  const result = await cartService.getCheckout(
    callerId(req), oneString(req.query.direction)
  );
  return res.status(200).json(result);
});

// PATCH /api/checkout - id columns only, whitelisted in the repo; the three
// address slots are checked against the caller's own book.
export const patchCheckout = asyncHandler(async (req, res) => {
  const { direction, ...patch } = req.body ?? {};
  const result = await cartService.patchCheckout(callerId(req), direction, patch);
  return res.status(200).json(result);
});

// POST /api/checkout/fulfillment {direction, method_id} - ensure the draft
// fulfillment and set its method; the row keeps the draft's id.
export const setCheckoutFulfillment = asyncHandler(async (req, res) => {
  const { direction, method_id, handoff_code } = req.body ?? {};
  const result = await cartService.setFulfillmentMethod(
    callerId(req), direction, method_id, handoff_code
  );
  return res.status(200).json(result);
});

// POST /api/checkout/payout {direction, ...bank form} - the payout step's
// write (D210). The numbers are sealed at rest by payments/details; the
// response carries the row WITHOUT them, only last_four.
export const saveCheckoutPayout = asyncHandler(async (req, res) => {
  const { direction, ...form } = req.body ?? {};
  const result = await cartService.saveCheckoutPayout(callerId(req), direction, form);
  return res.status(200).json(result);
});
