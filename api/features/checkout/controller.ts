import { callerId, requiredParam } from "#shared/http/caller.ts";
import { oneString } from "#shared/http/query.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as cartService from "#features/checkout/service.ts";

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
export const getCart = asyncHandler(async (req, res) => {
  await cartService.getCart(callerId(req));
  return res.status(200).json({ success: true });
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
