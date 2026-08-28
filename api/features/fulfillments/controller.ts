import { requiredParam } from "#shared/http/caller.ts";
import { oneString } from "#shared/http/query.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as fulfillmentService from "#features/fulfillments/service.ts";
import * as orderRead from "#features/fulfillments/order-read.ts";
import * as compose from "#features/fulfillments/compose.ts";

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

// BARE ROWS ON THE WIRE (wave-2 final form): what the service composes -
// the nested method its own logic branches on - never leaves the API.
export const getForOrder = asyncHandler(async (req, res) => {
  const order_id = requiredParam(req.query.order_id, "order_id");
  const row = await fulfillmentService.getForOrder(order_id, {
    userId: req.user?.id,
    isAdmin: req.user?.role === "admin",
  });
  return res.status(200).json(row ? compose.toWire(row) : row);
});

// Everyone due somewhere, soonest first. The window comes from the query rather
// than defaulting to "today", because an admin scrolling next week wants next
// week and a default would quietly hide it.
export const getSchedule = asyncHandler(async (req, res) => {
  // Optional window and filter. Narrowed one at a time because Express delivers
  // arrays and objects here too, and a filter nobody sent must read as absent.
  const from = oneString(req.query.from);
  const to = oneString(req.query.to);
  const employee_id = oneString(req.query.employee_id);
  // The schedule is COMPOSED internally (the sort is by the booking's start
  // time) and wired down to bare rows - the booking details become wave 3's
  // own child reads.
  const rows = await fulfillmentService.getSchedule({ from, to, employee_id });
  return res.status(200).json(rows.map(compose.toWire));
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

// GET /api/orders/:orderId/fulfillments - the chain, resolved to BARE
// verbatim rows (see order-read.ts). Mounted from the orders routes - reads
// resolve from the parent path - with the handler here because fulfillments
// owns the chain. No fulfillment answers 404, because the resource asked for
// does not exist.
export const getFulfillmentByOrder = asyncHandler(async (req, res) => {
  const fulfillment = await orderRead.getOrderFulfillment(req.params.orderId);
  if (!fulfillment) {
    return res.status(404).json({
      error: "Not Found",
      message: `order ${req.params.orderId} has no fulfillment`,
    });
  }
  return res.json(fulfillment);
});

// GET /api/orders/:orderId/pickups - fulfillments.pickups rows, VERBATIM.
// [] when the order has no fulfillment or its method is not a pickup; see
// order-read.ts.
export const getPickupsByOrder = asyncHandler(async (req, res) => {
  return res.json(await orderRead.getOrderPickups(req.params.orderId));
});

// GET /api/orders/:orderId/directs - fulfillments.directs rows, VERBATIM.
export const getDirectsByOrder = asyncHandler(async (req, res) => {
  return res.json(await orderRead.getOrderDirects(req.params.orderId));
});
