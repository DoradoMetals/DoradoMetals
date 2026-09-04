import {
  FulfillmentCancelScheduleBody, FulfillmentSetMethodBody, FulfillmentSetStatusBody,
} from "@dorado/contracts";
import { uuidParam, parseStrict } from "#shared/http/validate.ts";
import { oneString } from "#shared/http/query.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as fulfillmentService from "#domain/fulfillments/service.ts";

// The thin remainder: methods handlers live in methods/controller.ts, booking
// handlers in pickups/ and directs/. What is here spans children - the
// fulfillment view, the merged schedule, the method change and the cancel.
//
// EVERY ONE ANSWERS THE FulfillmentView: the row, its method, its children and
// what may be done to it. A caller that has just moved an order onto a pickup
// gets back a view whose `actions.schedule` is already true, so nothing has to
// be re-derived or re-fetched to know what to offer next.

// Everyone due somewhere, soonest first. The window comes from the query rather
// than defaulting to "today", because an admin scrolling next week wants next
// week and a default would quietly hide it.
export const getSchedule = asyncHandler(async (req, res) => {
  // Optional window and filter. Narrowed one at a time because Express delivers
  // arrays and objects here too, and a filter nobody sent must read as absent.
  const from = oneString(req.query.from);
  const to = oneString(req.query.to);
  const employee_id = oneString(req.query.employee_id);
  return res.status(200).json(await fulfillmentService.getSchedule({ from, to, employee_id }));
});

export const cancelSchedule = asyncHandler(async (req, res) => {
  const body = parseStrict(FulfillmentCancelScheduleBody, req.body, "fulfillments/cancel_schedule body");
  return res.status(200).json(await fulfillmentService.cancelSchedule(body.fulfillment_id));
});

export const setMethod = asyncHandler(async (req, res) => {
  const body = parseStrict(FulfillmentSetMethodBody, req.body, "fulfillments/set_method body");
  // WHO is not sent down - the audit_stamp trigger reads the session off the connection.
  return res.status(200).json(
    await fulfillmentService.setMethod({ id: body.fulfillment_id, method_id: body.method_id })
  );
});

export const setStatus = asyncHandler(async (req, res) => {
  const body = parseStrict(FulfillmentSetStatusBody, req.body, "fulfillments/set_status body");
  return res.status(200).json(
    await fulfillmentService.setStatus({ id: body.fulfillment_id, status: body.status })
  );
});

// GET /api/orders/:orderId/fulfillments - THE ONE READ of how an order is
// handed over. It replaces the query-string twin (GET /fulfillments/
// get_for_order), which answered the same question about the same table from a
// second URL; the order id is the key every caller holds, so the parent path
// is the one that stays.
// Owner-or-admin, checked by the service against the ORDER, because a
// fulfillment carries no user of its own.
export const getFulfillmentByOrder = asyncHandler(async (req, res) => {
  const order_id = uuidParam(req, "orderId");
  const view = await fulfillmentService.getForOrder(order_id, {
    userId: req.user?.id,
    isAdmin: req.user?.role === "admin",
  });
  if (!view) {
    return res.status(404).json({
      error: "Not Found",
      message: `order ${order_id} has no fulfillment`,
    });
  }
  return res.json(view);
});
