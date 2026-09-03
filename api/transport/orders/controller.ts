// The order row's own handlers, and nothing else (ruling 26c). Each parses its
// body against the contract in STRICT mode and its ids with uuidParam, then
// calls ONE use case. The paths did not move (ruling 13).
import { callerId } from "#shared/http/caller.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { refuseWith } from "#shared/http/refuse.ts";
import { strictBody, uuidParam } from "#shared/http/validate.ts";
import * as orderPatch from "#domain/orders/patch.ts";
import * as orderRead from "#domain/orders/read.ts";
import * as place from "#domain/orders/place.ts";
import * as ordersRepo from "#db/orders/repo.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import { SalesOrderCreate, OrderReviewCreate } from "@dorado/contracts";

// GET /api/orders - the SLIM list: each order is its row plus `totals`, nothing
// nested. Row scope: an owner gets their own (the SESSION's id, never the
// query's), an admin every order or ?user_id='s; ?direction= narrows either.
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

// THE PATCH'S STRICT PARSE IS THE SERVICE'S refusedField: the same contract
// through refusedValue, but asking the unknown-field question first so the
// refusal NAMES the field, and needing the order's direction, which no schema
// can see. The ORIGINAL body goes down - absent, null and a value are three
// different instructions (shared/http/patch-body.ts).
export const patchOrder = asyncHandler(async (req, res) => {
  const updated = await orderPatch.patchOrder(uuidParam(req, "id"), req.body ?? {});
  return res.status(200).json(updated);
});

// THE CREATE SURFACE, both directions; the paths are unchanged (ruling 13).
// There is no cancelOrder for a SALES order and there never worked one - what
// cancelling one should do is a business decision, not a missing handler.

// ZERO BODY (D210): every choice is already a server-side resource - the
// checkout row's ids, the draft fulfillment, the sealed payout account.
export const createPurchaseOrderFromCheckout = asyncHandler(async (req, res) => {
  const order = await place.placeOrder(callerId(req));
  return res.status(200).json(order);
});

// The customer door: the session is resolved server-side, never from the body.
export const createSalesOrder = asyncHandler(async (req, res) => {
  const body = strictBody(SalesOrderCreate, req.body);
  const order = await place.placeSale({
    sales_order: body.sales_order,
    payment_intent_id: body.payment_intent_id ?? "",
    user: await place.callerFrom(req.headers),
  });
  return res.status(200).json(order);
});

// The same use case with the named CUSTOMER as the actor, which is also whose
// intent the ownership check keys on.
export const adminCreateSalesOrder = asyncHandler(async (req, res) => {
  const body = strictBody(SalesOrderCreate, req.body);
  if (!body.user) refuseWith(400, `"user" is required on an admin create`);
  const order = await place.placeSale({
    sales_order: body.sales_order,
    payment_intent_id: body.payment_intent_id ?? "",
    user: body.user!,
  });
  return res.status(200).json(order);
});

// The review flag: one column on the order row, both directions, one handler.
export const createOrderReview = asyncHandler(async (req, res) => {
  const body = strictBody(OrderReviewCreate, req.body);
  const written = await withTransaction((c) =>
    ordersRepo.update(body.order.id, { review_created: true }, {}, c)
  );
  if (!written) refuseWith(404, `no order ${body.order.id}`);
  return res.status(200).json({ success: true });
});
