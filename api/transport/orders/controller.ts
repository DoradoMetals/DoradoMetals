// The order row's own handlers, and nothing else (ruling 26c). Each parses its
// body against the contract in STRICT mode and its ids with uuidParam, then
// calls ONE use case and sends what it answered.
//
// NOTHING REFUSES HERE ANY MORE except a malformed request. A use case throws a
// domain error (shared/errors.ts) and Express 5 carries it to the error
// middleware, which maps the kind to a status - so a controller has no
// try/catch, no status codes and no dispatch.
import { callerId } from "#shared/http/caller.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { refuseWith } from "#shared/http/refuse.ts";
import { strictBody, uuidParam } from "#shared/http/validate.ts";
import * as orders from "#domain/orders/service.ts";
import * as orderRead from "#domain/orders/read.ts";
import * as place from "#domain/orders/place.ts";
import * as checkoutService from "#domain/checkout/service.ts";
import * as ordersRepo from "#db/orders/repo.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import { Forbidden, NotFound } from "#shared/errors.ts";
import { orders as ordersContract } from "@dorado/contracts";

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

// PATCH /api/orders/:id - the order row's own fields. `status` and `notes`; the
// four actions that used to ride in this body are the routes below.
export const patchOrder = asyncHandler(async (req, res) => {
  const changes = strictBody(ordersContract.orders.Patch, req.body);
  return res.status(200).json(await orders.patch(uuidParam(req, "id"), changes));
});

// THE CREATE SURFACE, both directions, ONE handler: the body is the checkout's
// id and the customer is that row's own user_id (ruling 43). It replaces the
// zero-body purchase create and the two body-driven sale creates.
//
// OWNERSHIP IS ASKED HERE, not in the use case: a customer places their own
// checkout, an admin places anybody's.
export const createOrderFromCheckout = asyncHandler(async (req, res) => {
  const { checkout_id } = strictBody(ordersContract.orders.New, req.body);
  const checkout = await checkoutService.getRowById(checkout_id);
  if (!checkout) throw new NotFound(`no checkout ${checkout_id}`);
  if (checkout.user_id !== callerId(req) && req.user?.role !== "admin") {
    throw new Forbidden(`checkout ${checkout_id} is not yours`);
  }
  return res.status(200).json(await place.place(checkout_id));
});

// The review flag: one column on the order row, both directions, one handler.
export const createOrderReview = asyncHandler(async (req, res) => {
  const body = strictBody(ordersContract.orders.ReviewBody, req.body);
  const written = await withTransaction((tx) =>
    ordersRepo.update(body.order.id, { review_created: true }, {}, tx)
  );
  if (!written) throw new NotFound(`no order ${body.order.id}`);
  return res.status(200).json({ success: true });
});

// ------------------------------------------------------------- the actions
//
// Four operations that were flags in the PATCH body until D214 item 11. Each is
// a real action - it moves money, calls a carrier, or sends a message - so each
// earns a POST of its own (docs/waves/rest-routes.md).

export const addFundsToOrder = asyncHandler(async (req, res) => {
  return res.status(200).json(await orders.addFunds(uuidParam(req, "id")));
});

export const finalizeOrderPricing = asyncHandler(async (req, res) => {
  return res.status(200).json(await orders.finalizePricing(uuidParam(req, "id")));
});

export const cancelOrder = asyncHandler(async (req, res) => {
  const input = strictBody(ordersContract.orders.CancelBody, req.body);
  return res.status(200).json(await orders.cancel(uuidParam(req, "id"), input));
});

export const sendOrderToRefiner = asyncHandler(async (req, res) => {
  const { refiner_id } = strictBody(ordersContract.orders.SendToRefinerBody, req.body);
  return res.status(200).json(await orders.sendToRefiner(uuidParam(req, "id"), refiner_id));
});
