import { ScheduleFulfillmentDirectBody } from "@dorado/contracts";
import { parseStrict, uuidParam } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as directService from "#domain/fulfillments/directs/service.ts";
import { z } from "zod/v4";

const ScheduleBody = z.object({ direct: ScheduleFulfillmentDirectBody.strict() }).strict();

export const scheduleDirect = asyncHandler(async (req, res) => {
  const body = parseStrict(ScheduleBody, req.body, "fulfillments/schedule_direct body");
  return res.status(200).json(await directService.schedule(body.direct));
});

// GET /api/orders/:orderId/directs - fulfillments.directs rows, VERBATIM.
export const getDirectsByOrder = asyncHandler(async (req, res) => {
  return res.json(await directService.forOrder(uuidParam(req, "orderId")));
});
