import { FulfillmentScheduleDirectBody } from "@dorado/contracts";
import { parseStrict, uuidParam } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as directService from "#domain/fulfillments/directs/service.ts";

// POST /api/fulfillments/schedule_direct - see the pickup twin: the
// fulfillment is named once, at the top level.
export const scheduleDirect = asyncHandler(async (req, res) => {
  const body = parseStrict(
    FulfillmentScheduleDirectBody, req.body, "fulfillments/schedule_direct body"
  );
  return res.status(200).json(
    await directService.schedule(body.fulfillment_id, body.direct)
  );
});

// GET /api/orders/:orderId/directs - fulfillments.directs rows, VERBATIM.
export const getDirectsByOrder = asyncHandler(async (req, res) => {
  return res.json(await directService.forOrder(uuidParam(req, "orderId")));
});
