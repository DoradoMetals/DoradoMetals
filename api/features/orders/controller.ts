import { callerId } from "#shared/http/caller.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as orderPatch from "#features/orders/patch.service.ts";
import * as orderRead from "#features/orders/read.ts";
import * as orderItemsRepo from "#features/orders/items/repo.ts";
import * as orderAddressesRepo from "#features/orders/addresses/repo.ts";
import * as placeAddresses from "#features/places/addresses/repo.ts";
import * as orderSpotsRepo from "#features/orders/spots/repo.ts";

// GET /api/orders - the unified list read, and since wave 3 the SLIM one:
// each order is its orders.orders row plus `totals`, verbatim, with nothing
// nested (Jacob: "We don't need to send all that shit back in the body with
// it"). Items, spots, the address, the payout, the fulfillment chain and the
// refiner engagement are each their own parent-path read - see the family in
// packages/contracts/src/wire/orders.ts.
//
// Each caller's row scope is preserved exactly as the four legacy list routes
// had it:
//
//   owner                        their own orders (the session's id, never the
//                                query's - the subjectOf precedent: a customer
//                                naming another user gets their own)
//   admin                        every order
//   admin + ?user_id=            that user's orders
//   ?direction=purchase|sale     one direction; absent, both, newest first
//
// ONE STATEMENT PAIR SERVES ALL FOUR. The per-direction services used to be
// called and merged in JS; orders.orders is one table with a `direction`
// column, so the narrowing is a WHERE clause and the newest-first order is
// the statement's, not a re-sort of two lists.
export const listOrders = asyncHandler(async (req, res) => {
  const callerIdValue = callerId(req);
  const isAdmin = req.user?.role === "admin";

  const direction =
    typeof req.query.direction === "string" ? req.query.direction : null;
  if (direction !== null && direction !== "purchase" && direction !== "sale") {
    const err: Error & { statusCode?: number } = new Error(
      `"direction" is "purchase" or "sale"`
    );
    err.statusCode = 400;
    throw err;
  }

  const namedUser =
    isAdmin && typeof req.query.user_id === "string" ? req.query.user_id : null;
  const user_id = isAdmin && !namedUser ? null : (namedUser ?? callerIdValue);

  return res.json(await orderRead.list({ direction, user_id }));
});

export const patchOrder = asyncHandler(async (req, res) => {
  // The one-place acknowledgement that req.user is optional on the type; on
  // this guarded route it never fires.
  callerId(req);
  const updated = await orderPatch.patchOrder(req.params.id, req.body ?? {}, req.user!);
  return res.status(200).json(updated);
});

export const putOrderSpots = asyncHandler(async (req, res) => {
  const spots = await orderPatch.putOrderSpots(req.params.id, req.body ?? {});
  return res.status(200).json(spots);
});

export const createOrderItem = asyncHandler(async (req, res) => {
  const updated = await orderPatch.createOrderItem(req.params.id, req.body ?? {});
  return res.status(200).json({ updated });
});

// GET /api/orders/:id/spots - the spots an order was quoted at, as VERBATIM
// TABLE ROWS (rulings 9 + 12). Replaces get_purchase_order_metals AND
// get_order_metals: orders.spots is one table for both directions, so one
// read serves both. The metal is its id - a display name is the client's to
// map from the spots reference read. Ownership-or-admin is the route's
// requireOwnOrderParam; an order with no spots (unlocked, or no metal quoted)
// answers [] rather than 404, because "no quotes yet" is an answer about a
// real order.
export const getOrderSpots = asyncHandler(async (req, res) => {
  return res.json(await orderSpotsRepo.getRowsFor(req.params.id));
});

// GET /api/orders/:id/items - the order's LINES as VERBATIM orders.items rows
// (rulings 9 + 12). One table, both directions, scrap and bullion alike:
// bullion_id is the only product reference a line carries and null means
// scrap, which is what "combining scrap/bullion into just items" was for.
// A display name is the client's to map from the catalogue it already
// caches. An order with no lines answers [] - a real answer about a real
// order, not a 404.
export const getOrderItems = asyncHandler(async (req, res) => {
  return res.json(await orderItemsRepo.getFor(req.params.id));
});

// GET /api/orders/:id/address - the address SNAPSHOT: the places.addresses
// row the parcel actually went to, verbatim.
//
// THE CHAIN IS RESOLVED SERVER-SIDE, IN THE WHERE CLAUSE (ruling 12), which
// is what lets this answer with a row of one table rather than a link plus a
// nesting: orders.addresses names the snapshot, this reads it. 404 when the
// order has no address link - 43 of dev's 63 orders are in that state, which
// is a real answer about a resource that does not exist.
export const getOrderAddress = asyncHandler(async (req, res) => {
  const link = await orderAddressesRepo.getFor(req.params.id);
  const snapshot = link ? await placeAddresses.getOne(link.address_id) : null;
  if (!snapshot) {
    return res.status(404).json({
      error: "Not Found",
      message: `order ${req.params.id} has no address`,
    });
  }
  return res.json(snapshot);
});
