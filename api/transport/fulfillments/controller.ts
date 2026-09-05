import {
  FulfillmentCancelScheduleBody, FulfillmentCreateBody, FulfillmentPatchBody,
  FulfillmentSetMethodBody, FulfillmentSetStatusBody,
} from "@dorado/contracts";
import { uuidParam, parseStrict } from "#shared/http/validate.ts";
import { oneString } from "#shared/http/query.ts";
import { callerId } from "#shared/http/caller.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { requireFulfillmentOwner } from "#transport/fulfillments/owner.ts";
import * as fulfillmentDrafts from "#domain/fulfillments/drafts.ts";
import * as fulfillmentService from "#domain/fulfillments/service.ts";

export const getSchedule = asyncHandler(async (req, res) => {
  const from = oneString(req.query.from);
  const to = oneString(req.query.to);
  const employee_id = oneString(req.query.employee_id);
  return res.status(200).json(
    await fulfillmentService.getSchedule(from ?? null, to ?? null, employee_id ?? null)
  );
});

export const cancelSchedule = asyncHandler(async (req, res) => {
  const body = parseStrict(FulfillmentCancelScheduleBody, req.body, "fulfillments/cancel_schedule body");
  return res.status(200).json(await fulfillmentService.cancelSchedule(body.fulfillment_id));
});

export const setMethod = asyncHandler(async (req, res) => {
  const body = parseStrict(FulfillmentSetMethodBody, req.body, "fulfillments/set_method body");
  return res.status(200).json(
    await fulfillmentService.setMethod(body.fulfillment_id, body.method_id)
  );
});

export const setStatus = asyncHandler(async (req, res) => {
  const body = parseStrict(FulfillmentSetStatusBody, req.body, "fulfillments/set_status body");
  return res.status(200).json(
    await fulfillmentService.setStatus(body.fulfillment_id, body.status)
  );
});

export const getFulfillmentByOrder = asyncHandler(async (req, res) => {
  const order_id = uuidParam(req, "orderId");
  const view = await fulfillmentService.getForOrder(
    order_id, req.user?.id ?? null, req.user?.role === "admin"
  );
  if (!view) {
    return res.status(404).json({
      error: "Not Found",
      message: `order ${order_id} has no fulfillment`,
    });
  }
  return res.json(view);
});

export const createFulfillment = asyncHandler(async (req, res) => {
  const body = parseStrict(FulfillmentCreateBody, req.body, "fulfillments body");
  return res.status(200).json(
    await fulfillmentDrafts.createForCheckout(
      body, callerId(req), req.user?.role === "admin"
    )
  );
});

export const getFulfillment = asyncHandler(async (req, res) => {
  const id = uuidParam(req, "id");
  await requireFulfillmentOwner(req, id);
  const view = await fulfillmentService.getById(id);
  if (!view) {
    return res.status(404).json({
      error: "Not Found", message: `no such fulfillment: ${id}`,
    });
  }
  return res.status(200).json(view);
});

export const patchFulfillment = asyncHandler(async (req, res) => {
  const id = uuidParam(req, "id");
  await requireFulfillmentOwner(req, id);
  const body = parseStrict(FulfillmentPatchBody, req.body, "fulfillments PATCH body");
  return res.status(200).json(await fulfillmentService.patchChoices(id, body));
});
