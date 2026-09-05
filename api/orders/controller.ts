import { callerId } from "#shared/http/caller.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { refuseWith } from "#shared/http/refuse.ts";
import { strictBody, uuidParam } from "#shared/http/validate.ts";
import * as orders from "#orders/service.ts";
import * as orderRead from "#orders/read.ts";
import * as place from "#orders/place.ts";
import * as checkoutService from "#checkout/service.ts";
import * as ordersRepo from "#db/orders/repo.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import { Forbidden, NotFound } from "#shared/errors.ts";
import { OrderCancelBody, OrderCreateBody, OrderPatch, OrderReviewBody, OrderSendToRefinerBody } from "@dorado/contracts";

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

  return res.json(await orderRead.list(direction, user_id));
});

export const getOrder = asyncHandler(async (req, res) => {
  const id = uuidParam(req, "id");
  const view = await orderRead.view(id);
  if (!view) throw new NotFound(`no order ${id}`);
  return res.json(view);
});

export const patchOrder = asyncHandler(async (req, res) => {
  const changes = strictBody(OrderPatch, req.body);
  return res.status(200).json(await orders.patch(uuidParam(req, "id"), changes));
});

export const createOrderFromCheckout = asyncHandler(async (req, res) => {
  const { checkout_id } = strictBody(OrderCreateBody, req.body);
  const checkout = await checkoutService.getRowById(checkout_id);
  if (!checkout) throw new NotFound(`no checkout ${checkout_id}`);
  if (checkout.user_id !== callerId(req) && req.user?.role !== "admin") {
    throw new Forbidden(`checkout ${checkout_id} is not yours`);
  }
  return res.status(200).json(await place.place(checkout_id));
});

export const createOrderReview = asyncHandler(async (req, res) => {
  const body = strictBody(OrderReviewBody, req.body);
  const written = await withTransaction((tx) =>
    ordersRepo.update(body.order.id, { review_created: true }, {}, tx)
  );
  if (!written) throw new NotFound(`no order ${body.order.id}`);
  return res.status(200).json({ success: true });
});

export const addFundsToOrder = asyncHandler(async (req, res) => {
  return res.status(200).json(await orders.addFunds(uuidParam(req, "id")));
});

export const finalizeOrderPricing = asyncHandler(async (req, res) => {
  return res.status(200).json(await orders.finalizePricing(uuidParam(req, "id")));
});

export const cancelOrder = asyncHandler(async (req, res) => {
  const input = strictBody(OrderCancelBody, req.body);
  return res.status(200).json(await orders.cancel(uuidParam(req, "id"), input));
});

export const sendOrderToRefiner = asyncHandler(async (req, res) => {
  const { refiner_id } = strictBody(OrderSendToRefinerBody, req.body);
  return res.status(200).json(await orders.sendToRefiner(uuidParam(req, "id"), refiner_id));
});
