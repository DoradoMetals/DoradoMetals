import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as purchaseOrderService from "#features/purchase-orders/service.js"

export const getPurchaseOrderById = asyncHandler(async (req, res) => {
  const orderId = req.params.id;
  const order = await purchaseOrderService.getById(orderId);
  return res.json(order);
});

export const getPurchaseOrders = asyncHandler(async (req, res) => {
  const userId = req.user.id;
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

export const createPurchaseOrder = asyncHandler(async (req, res) => {
  const { purchase_order, user_id } = req.body;
  const order = await purchaseOrderService.createPurchaseOrder(purchase_order, user_id);
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
