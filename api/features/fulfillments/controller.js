import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as fulfillmentService from "#features/fulfillments/service.js";

// The menu a customer is offered, per direction. Guarded rather than public:
// which methods exist and which are hidden is operational information, and a
// signed-out visitor has no order to fulfil.
export const getMethods = asyncHandler(async (req, res) => {
  const { direction } = req.query;
  const rows = await fulfillmentService.listMethods(direction);
  return res.status(200).json(rows);
});

export const getAllMethods = asyncHandler(async (req, res) => {
  const rows = await fulfillmentService.listAllMethods();
  return res.status(200).json(rows);
});

export const updateMethod = asyncHandler(async (req, res) => {
  const { method } = req.body;
  const saved = await fulfillmentService.updateMethod({
    ...method,
    updated_by_id: req.user?.id ?? null,
  });
  return res.status(200).json(saved);
});

export const getForOrder = asyncHandler(async (req, res) => {
  const { order_id } = req.query;
  const row = await fulfillmentService.getForOrder(order_id, {
    userId: req.user?.id,
    isAdmin: req.user?.role === "admin",
  });
  return res.status(200).json(row);
});

// Everyone due somewhere, soonest first. The window comes from the query rather
// than defaulting to "today", because an admin scrolling next week wants next
// week and a default would quietly hide it.
export const getSchedule = asyncHandler(async (req, res) => {
  const { from, to, employee_id } = req.query;
  const rows = await fulfillmentService.getSchedule({ from, to, employee_id });
  return res.status(200).json(rows);
});

export const schedulePickup = asyncHandler(async (req, res) => {
  const { pickup } = req.body;
  const saved = await fulfillmentService.schedulePickup(pickup);
  return res.status(200).json(saved);
});

export const scheduleDirect = asyncHandler(async (req, res) => {
  const { direct } = req.body;
  const saved = await fulfillmentService.scheduleDirect(direct);
  return res.status(200).json(saved);
});

export const cancelSchedule = asyncHandler(async (req, res) => {
  const { fulfillment_id } = req.body;
  const saved = await fulfillmentService.cancelSchedule(fulfillment_id);
  return res.status(200).json(saved);
});

export const setMethod = asyncHandler(async (req, res) => {
  const { fulfillment_id, method_id } = req.body;
  const saved = await fulfillmentService.setMethod({
    id: fulfillment_id,
    method_id,
    updated_by_id: req.user?.id ?? null,
  });
  return res.status(200).json(saved);
});

export const setStatus = asyncHandler(async (req, res) => {
  const { fulfillment_id, status } = req.body;
  const saved = await fulfillmentService.setStatus({
    id: fulfillment_id,
    status,
    updated_by_id: req.user?.id ?? null,
  });
  return res.status(200).json(saved);
});
