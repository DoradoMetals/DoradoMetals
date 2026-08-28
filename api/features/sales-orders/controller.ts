import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as salesOrderService from "#features/sales-orders/service.ts"

// THE READS LEFT THIS FEATURE with the read-flip wave, the way the mutations
// left with D87. The lists are GET /api/orders; the spots
// GET /api/orders/:id/spots - one namespace, both directions. Four read
// handlers (getSalesOrderById, getSalesOrders, getAllSalesOrders,
// getOrderMetals) deleted with their routes.

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

// THE MUTATION SURFACE LEFT THIS FEATURE with the unified /api/orders
// namespace (Jacob, 28 August): the status label and the supplier send are
// fields of PATCH /api/orders/:id, direction-validated as data; the tracking
// write is PATCH /api/shipments/:id, because a tracking number is shipment
// data. features/orders/patch.service.ts dispatches to the same services this
// file used to front.

export const createReview = asyncHandler(async (req, res) => {
  const result = await salesOrderService.createReview(req.body);
  return res.status(200).json(result);
});
