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

export const acceptOffer = asyncHandler(async (req, res) => {
  const { order, order_spots, spot_prices } = req.body;
  const { purchaseOrder, orderSpots } = await purchaseOrderService.acceptOffer({
    order,
    order_spots,
    spot_prices,
  });
  return res.status(200).json({ purchaseOrder, orderSpots });
});

export const rejectOffer = asyncHandler(async (req, res) => {
  const { order, offer_notes } = req.body;
  const updated = await purchaseOrderService.rejectOffer({
    orderId: order.id,
    offerNotes: offer_notes,
  });
  return res.status(200).json(updated);
});

export const cancelOrder = asyncHandler(async (req, res) => {
  const { order, return_shipment } = req.body;
  const result = await purchaseOrderService.cancelOrder({ order, return_shipment });
  return res.status(200).json(result);
});

export const updateOfferNotes = asyncHandler(async (req, res) => {
  const { order, offer_notes } = req.body;
  const result = await purchaseOrderService.updateOfferNotes({ order, offer_notes });
  return res.status(200).json(result);
});

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

export const sendOffer = asyncHandler(async (req, res) => {
  await purchaseOrderService.sendOffer(req.body);
  const updated = await purchaseOrderService.updateStatus(req.body);
  return res.status(200).json(updated);
});

export const updateRejectedOffer = asyncHandler(async (req, res) => {
  await purchaseOrderService.updateRejectedOffer(req.body);
  const updated = await purchaseOrderService.updateStatus(req.body);
  return res.status(200).json(updated);
});

export const updateStatus = asyncHandler(async (req, res) => {
  const updated = await purchaseOrderService.updateStatus(req.body);
  return res.status(200).json(updated);
});

export const updateSpot = asyncHandler(async (req, res) => {
  const updated = await purchaseOrderService.updateSpot(req.body);
  return res.status(200).json({ updated });
});

export const lockSpots = asyncHandler(async (req, res) => {
  const updated = await purchaseOrderService.lockSpots(req.body);
  return res.status(200).json({ updated });
});

export const unlockSpots = asyncHandler(async (req, res) => {
  const updated = await purchaseOrderService.unlockSpots(req.body);
  return res.status(200).json({ updated });
});

export const saveOrderItems = asyncHandler(async (req, res) => {
  const updated = await purchaseOrderService.toggleOrderItemStatus({
    item_status: true,
    ids: req.body.ids,
    purchase_order_id: req.body.purchase_order_id,
  });
  return res.status(200).json({ updated });
});

export const resetOrderItems = asyncHandler(async (req, res) => {
  const updated = await purchaseOrderService.toggleOrderItemStatus({
    item_status: false,
    ids: [req.body.id],
    purchase_order_id: req.body.purchase_order_id,
  });
  return res.status(200).json({ updated });
});

export const deleteOrderItems = asyncHandler(async (req, res) => {
  const updated = await purchaseOrderService.deleteOrderItems(req.body);
  return res.status(200).json({ updated });
});

export const updateScrapItem = asyncHandler(async (req, res) => {
  const updated = await purchaseOrderService.updateScrapItem(req.body);
  return res.status(200).json({ updated });
});

export const createOrderItem = asyncHandler(async (req, res) => {
  const updated = await purchaseOrderService.createOrderItem(req.body);
  return res.status(200).json({ updated });
});

export const updateBullion = asyncHandler(async (req, res) => {
  const updated = await purchaseOrderService.updateBullion(req.body);
  return res.status(200).json({ updated });
});

export const editShippingCharge = asyncHandler(async (req, res) => {
  await purchaseOrderService.editShippingCharge(req.body);
  return res.status(200).json({ success: true });
});

export const editPayoutCharge = asyncHandler(async (req, res) => {
  await purchaseOrderService.editPayoutCharge(req.body);
  return res.status(200).json({ success: true });
});

export const changePayoutMethod = asyncHandler(async (req, res) => {
  await purchaseOrderService.changePayoutMethod(req.body);
  return res.status(200).json({ success: true });
});

export const addFundsToAccount = asyncHandler(async (req, res) => {
  await purchaseOrderService.addFundsToAccount(req.body);
  return res.status(200).json({ success: true });
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

export const updateRefinerSpot = asyncHandler(async (req, res) => {
  const updated = await purchaseOrderService.updateRefinerSpot(req.body);
  return res.status(200).json({ updated });
});

export const updateRefinerPremium = asyncHandler(async (req, res) => {
  const updated = await purchaseOrderService.updateRefinerPremium(req.body);
  return res.status(200).json({ updated });
});

export const updateShippingActual = asyncHandler(async (req, res) => {
  const updated = await purchaseOrderService.updateShippingActual(req.body);
  return res.status(200).json({ updated });
});

export const updateRefinerFee = asyncHandler(async (req, res) => {
  const updated = await purchaseOrderService.updateRefinerFee(req.body);
  return res.status(200).json({ updated });
});

export const updatePoolOzDeducted = asyncHandler(async (req, res) => {
  const updated = await purchaseOrderService.updatePoolOzDeducted(req.body);
  return res.status(200).json({ updated });
});

export const updatePoolRemediation = asyncHandler(async (req, res) => {
  const updated = await purchaseOrderService.updatePoolRemediation(req.body);
  return res.status(200).json({ updated });
});

export const getPayoutDetails = asyncHandler(async (req, res) => {
  const details = await purchaseOrderService.getPayoutDetails(req.body);
  return res.status(200).json(details);
});
