import { callerId } from "#shared/http/caller.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as purchaseOrderService from "#features/purchase-orders/service.ts"

export const getPurchaseOrderById = asyncHandler(async (req, res) => {
  const orderId = req.params.id;
  const order = await purchaseOrderService.getById(orderId);
  return res.json(order);
});

export const getPurchaseOrders = asyncHandler(async (req, res) => {
  const userId = callerId(req);
  const orders = await purchaseOrderService.listOrdersForUser(userId);
  return res.json(orders);
});

export const getAllPurchaseOrders = asyncHandler(async (req, res) => {
  const orders = await purchaseOrderService.getAll();
  return res.json(orders);
});

export const getPurchaseOrderMetals = asyncHandler(async (req, res) => {
  const { purchase_order_id } = req.body;
  const metals = await purchaseOrderService.getMetalsForOrder(purchase_order_id);
  return res.json(metals);
});

// THE MUTATION SURFACE LEFT THIS FEATURE. Every order write is
// PATCH /api/orders/:id and its sibling sub-resources - one namespace, both
// directions, direction validated as data - dispatched by
// features/orders/patch.service.ts to the same services this file used to
// front. What remains here are the reads, creation, and the review.

export const createReview = asyncHandler(async (req, res) => {
  const result = await purchaseOrderService.createReview(req.body);
  return res.status(200).json(result);
});

// WHOSE ORDER. This took `user_id` straight from the body behind requireUser,
// so a signed-in customer could place a purchase order attributed to somebody
// else - and this path buys a real FedEx label and can book a courier on the
// way through, so it spends money as it does it.
//
// Same shape as the address book and the order routes: an id taken from the
// request with nothing asking whose it is. FOLLOWUPS recorded it and deferred
// it because the write path was mid-rebuild; that rebuild has landed, so it is
// fixed here.
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
  const order = await purchaseOrderService.createPurchaseOrder(purchase_order, callerId(req));
  return res.status(200).json(order);
});

export const purgeCancelled = asyncHandler(async (req, res) => {
  await purchaseOrderService.purgeCancelled();
  return res.status(200).json({ success: true });
});

export const getPurchaseOrderRefinerMetals = asyncHandler(async (req, res) => {
  const { purchase_order_id } = req.body;
  const metals = await purchaseOrderService.getRefinerMetalsForOrder(purchase_order_id);
  return res.json(metals);
});

export const getPayoutDetails = asyncHandler(async (req, res) => {
  const details = await purchaseOrderService.getPayoutDetails(req.body);
  return res.status(200).json(details);
});
