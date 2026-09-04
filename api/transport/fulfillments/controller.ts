import { FulfillmentCancelScheduleBody, FulfillmentSetMethodBody, FulfillmentSetStatusBody } from "@dorado/contracts";
import { requiredParam } from "#shared/http/caller.ts";
import { parseStrict, uuidParam } from "#shared/http/validate.ts";
import { oneString } from "#shared/http/query.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as fulfillmentService from "#domain/fulfillments/service.ts";
import * as orderRead from "#domain/fulfillments/order-read.ts";
import * as compose from "#domain/fulfillments/compose.ts";

// The thin remainder: methods handlers live in methods/controller.ts, booking handlers in pickups/ and directs/. What's here spans children - the fulfillment itself, the merged schedule, the method change and the booking cancel.

// Bare rows on the wire: what the service composes (the nested method) never leaves the API.
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
  // Composed internally (sorted by the booking's start time) and wired down to bare rows - booking details are the children's own reads.
  const rows = await fulfillmentService.getSchedule({ from, to, employee_id });
  return res.status(200).json(rows.map(compose.toWire));
});

export const cancelSchedule = asyncHandler(async (req, res) => {
  const body = parseStrict(FulfillmentCancelScheduleBody, req.body, "fulfillments/cancel_schedule body");
  const saved = await fulfillmentService.cancelSchedule(body.fulfillment_id);
  return res.status(200).json(saved);
});

export const setMethod = asyncHandler(async (req, res) => {
  const body = parseStrict(FulfillmentSetMethodBody, req.body, "fulfillments/set_method body");
  // WHO isn't sent down any more - the audit_stamp trigger reads the session off the connection.
  const saved = await fulfillmentService.setMethod({ id: body.fulfillment_id, method_id: body.method_id });
  return res.status(200).json(saved);
});

export const setStatus = asyncHandler(async (req, res) => {
  const body = parseStrict(FulfillmentSetStatusBody, req.body, "fulfillments/set_status body");
  const saved = await fulfillmentService.setStatus({ id: body.fulfillment_id, status: body.status });
  return res.status(200).json(saved);
});

// GET /api/orders/:orderId/fulfillments - the chain, resolved to the bare verbatim row (see order-read.ts). Mounted from the orders routes (order id is the key); the handler lives here (fulfillments owns the chain).
// No fulfillment answers 404, because the resource asked for does not exist.
export const getFulfillmentByOrder = asyncHandler(async (req, res) => {
  const fulfillment = await orderRead.getOrderFulfillment(uuidParam(req, "orderId"));
  if (!fulfillment) {
    return res.status(404).json({
      error: "Not Found",
      message: `order ${uuidParam(req, "orderId")} has no fulfillment`,
    });
  }
  return res.json(fulfillment);
});
