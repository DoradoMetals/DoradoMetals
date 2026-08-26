import { callerId } from "#shared/http/caller.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as salesOrderService from "#features/sales-orders/service.ts"

export const getSalesOrderById = asyncHandler(async (req, res) => {
  const orderId = req.params.id;
  const order = await salesOrderService.getById(orderId);
  return res.json(order);
});

export const getSalesOrders = asyncHandler(async (req, res) => {
  const userId = callerId(req);
  const orders = await salesOrderService.listOrdersForUser(userId);
  return res.json(orders);
});

export const getAllSalesOrders = asyncHandler(async (req, res) => {
  const orders = await salesOrderService.getAll();
  return res.json(orders);
});

export const getOrderMetals = asyncHandler(async (req, res) => {
  const { sales_order_id } = req.body;
  const metals = await salesOrderService.getMetalsForOrder(sales_order_id);
  return res.json(metals);
});

// THERE IS NO cancelOrder HERE, AND THERE NEVER WORKED ONE.
//
// This exported a handler that awaited salesOrderService.cancelOrder, which the
// sales-orders service has never defined. It was mounted on no route - routes.js
// does not import it - and the frontend's "Cancel Order" button calls the
// PURCHASE order route, which does exist and works. So it was unreachable code
// that would have answered 500 the moment anyone wired it up.
//
// Removed rather than implemented: what cancelling a sales order should DO -
// whether it refunds, restocks, or only marks a status - is a business decision,
// and inventing one is not a typing change. Recorded in the decision log.
//
// Found by scripts/lint-namespace-calls.mjs.

export const createSalesOrder = asyncHandler(async (req, res) => {
  const order = await salesOrderService.createSalesOrder(req.body, req.headers);
  return res.status(200).json(order);
});

export const adminCreateSalesOrder = asyncHandler(async (req, res) => {
  const order = await salesOrderService.adminCreateSalesOrder(req.body);
  return res.status(200).json(order);
});

export const updateStatus = asyncHandler(async (req, res) => {
  const updated = await salesOrderService.updateStatus(req.body);
  return res.status(200).json(updated);
});

export const sendOrderToSupplier = asyncHandler(async (req, res) => {
  const order = await salesOrderService.sendOrderToSupplier(req.body);
  return res.status(200).json(order);
});

export const updateOrderTracking = asyncHandler(async (req, res) => {
  const order = await salesOrderService.updateTracking(req.body);
  return res.status(200).json(order);
});

export const createReview = asyncHandler(async (req, res) => {
  const result = await salesOrderService.createReview(req.body);
  return res.status(200).json(result);
});
