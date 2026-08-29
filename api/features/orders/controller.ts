import { callerId } from "#shared/http/caller.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import { refuseWith } from "#shared/http/refuse.ts";
import * as orderPatch from "#features/orders/patch.service.ts";
import * as orderRead from "#features/orders/read.ts";

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
