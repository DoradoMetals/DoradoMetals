import { callerId } from "#shared/http/caller.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { refuseWith } from "#shared/http/refuse.ts";
import * as orderPatch from "#features/orders/patch.service.ts";
import * as orderRead from "#features/orders/read.ts";
import * as orderService from "#features/orders/service.ts";

// THE ORDER ROW'S OWN HANDLERS, AND NOTHING ELSE (ruling 26c). The items,
// spots and address handlers moved to the resources that own those tables -
// features/orders/items, /spots and /addresses - each with its own routes.ts,
// controller.ts and service.ts. Their paths did not move.

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
    refuseWith(400, `"direction" is "purchase" or "sale"`);
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

// ---------------------------------------------------------------------------
// THE CREATE SURFACE, both directions.
//
// Was features/purchase-orders/controller.ts and
// features/sales-orders/controller.ts, which are gone: direction is a COLUMN.
// The paths these serve are NOT changing (ruling 13) - they are still
// POST /api/purchase_orders/create_purchase_order and its five siblings,
// declared in creates.routes.ts. Only the file you open to find the handler
// moved.
//
// THE READS LEFT BOTH FEATURES with the read-flip wave, the way the mutations
// left with D87. The lists are GET /api/orders; the spots
// GET /api/orders/:id/spots; the refiner spots
// GET /api/refiners/orders/:id/spots; the bank details
// GET /api/payouts/:id/details. Ten read handlers were deleted with their
// routes. What remains here is creation, the review flag, and the purge.
//
// THERE IS NO cancelOrder FOR A SALES ORDER, AND THERE NEVER WORKED ONE. The
// old sales controller exported a handler awaiting a service function that
// has never existed; it was mounted on no route, and the frontend's "Cancel
// Order" button calls the PURCHASE path, which does exist. Removed rather
// than implemented: what cancelling a sales order should DO - refund,
// restock, or only mark a status - is a business decision.

// WHOSE ORDER. This took `user_id` straight from the body behind requireUser,
// so a signed-in customer could place a purchase order attributed to somebody
// else - and this path buys a real FedEx label and can book a courier on the
// way through, so it spends money as it does it.
//
// The session, unconditionally, with no admin escape hatch - unlike addresses,
// where an admin legitimately reads another user's book. There is no admin
// caller for this route: the one frontend caller sends its own session id, and
// an admin placing an order on a customer's behalf has a separate route for
// sales orders (admin_create_sales_order, requireAdmin) rather than borrowing
// this one. A hatch nothing uses is a hatch nobody tests.
//
// Not a wire change: the body may still carry user_id, it is simply no longer
// believed.
export const createPurchaseOrder = asyncHandler(async (req, res) => {
  const { purchase_order } = req.body;
  const order = await orderService.createPurchaseOrder(purchase_order, callerId(req));
  return res.status(200).json(order);
});

export const createSalesOrder = asyncHandler(async (req, res) => {
  const order = await orderService.createSalesOrder(req.body, req.headers);
  return res.status(200).json(order);
});

export const adminCreateSalesOrder = asyncHandler(async (req, res) => {
  const order = await orderService.adminCreateSalesOrder(req.body);
  return res.status(200).json(order);
});

export const createPurchaseReview = asyncHandler(async (req, res) => {
  const result = await orderService.createPurchaseReview(req.body);
  return res.status(200).json(result);
});

export const createSalesReview = asyncHandler(async (req, res) => {
  const result = await orderService.createSalesReview(req.body);
  return res.status(200).json(result);
});

// MOVES, NOT MODIFIED (standing constraint).
export const purgeCancelled = asyncHandler(async (req, res) => {
  await orderService.purgeCancelled();
  return res.status(200).json({ success: true });
});
