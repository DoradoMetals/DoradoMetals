import { FulfillmentDirectPatch } from "@dorado/contracts";
import { parseStrict, uuidParam } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { Invalid } from "#shared/errors.ts";
import * as directService from "#domain/fulfillments/directs/service.ts";
import { z } from "zod/v4";

const ScheduleBody = z.object({ direct: FulfillmentDirectPatch.strict() }).strict();

export const scheduleDirect = asyncHandler(async (req, res) => {
  const body = parseStrict(ScheduleBody, req.body, "fulfillments/schedule_direct body");
  const { fulfillment_id } = body.direct;
  // Asserted here, not at the INSERT: assertCategory reads it first, so an
  // absent one would fail as a lookup miss rather than as a missing field.
  if (!fulfillment_id) throw new Invalid("fulfillment_id is required");
  return res.status(200).json(await directService.schedule({ ...body.direct, fulfillment_id }));
});

// GET /api/orders/:orderId/directs - fulfillments.directs rows, VERBATIM.
export const getDirectsByOrder = asyncHandler(async (req, res) => {
  return res.json(await directService.forOrder(uuidParam(req, "orderId")));
});
