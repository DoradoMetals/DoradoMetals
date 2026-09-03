import { requiredParam } from "#shared/http/caller.ts";
import { uuidParam, uuidField } from "#shared/http/validate.ts";
import { oneString } from "#shared/http/query.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as fulfillmentService from "#domain/fulfillments/service.ts";
import * as orderRead from "#domain/fulfillments/order-read.ts";
import * as compose from "#domain/fulfillments/compose.ts";

// THE THIN REMAINDER (ruling 26b). The methods handlers live in
// fulfillments/methods/controller.ts, the two booking handlers in
// fulfillments/pickups/ and fulfillments/directs/. What is here is what spans
// children: the fulfillment itself, the merged schedule, the method change and
// the booking cancel.

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
  // time) and wired down to bare rows - the booking details are the children's
  // own reads.
  const rows = await fulfillmentService.getSchedule({ from, to, employee_id });
  return res.status(200).json(rows.map(compose.toWire));
});

// NO CONTRACT SCHEMA EXISTS YET for these three bodies - @dorado/contracts has
// no fulfillment-cancel/set-method/set-status shape, so the id is checked by
// hand (uuidField) rather than by a strict parse (listed as a gap in the batch
// report, not hand-written as a schema).
export const cancelSchedule = asyncHandler(async (req, res) => {
  const fulfillment_id = uuidField(req.body, "fulfillment_id");
  const saved = await fulfillmentService.cancelSchedule(fulfillment_id);
  return res.status(200).json(saved);
});

export const setMethod = asyncHandler(async (req, res) => {
  const fulfillment_id = uuidField(req.body, "fulfillment_id");
  const method_id = uuidField(req.body, "method_id");
  // WHO is not sent down any more: the audit_stamp trigger reads the session
  // off the connection (migration 116, shared/http/actor.ts).
  const saved = await fulfillmentService.setMethod({ id: fulfillment_id, method_id });
  return res.status(200).json(saved);
});

export const setStatus = asyncHandler(async (req, res) => {
  const fulfillment_id = uuidField(req.body, "fulfillment_id");
  const { status } = req.body;
  const saved = await fulfillmentService.setStatus({ id: fulfillment_id, status });
  return res.status(200).json(saved);
});

// GET /api/orders/:orderId/fulfillments - the chain, resolved to the BARE
// verbatim row (see order-read.ts). Mounted from the orders routes - reads
// resolve from the parent path - with the handler here because fulfillments
// owns the chain. No fulfillment answers 404, because the resource asked for
// does not exist.
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
