import { FulfillmentPickupPatch } from "@dorado/contracts";
import { parseStrict, uuidParam } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { Invalid } from "#shared/errors.ts";
import * as pickupService from "#domain/fulfillments/pickups/service.ts";
import { z } from "zod/v4";

const ScheduleBody = z.object({ pickup: FulfillmentPickupPatch.strict() }).strict();

export const schedulePickup = asyncHandler(async (req, res) => {
  const body = parseStrict(ScheduleBody, req.body, "fulfillments/schedule_pickup body");
  const { fulfillment_id } = body.pickup;
  // Asserted here, not at the INSERT: assertCategory reads it first, so an
  // absent one would fail as a lookup miss rather than as a missing field.
  if (!fulfillment_id) throw new Invalid("fulfillment_id is required");
  return res.status(200).json(await pickupService.schedule({ ...body.pickup, fulfillment_id }));
});

// GET /api/orders/:orderId/pickups - fulfillments.pickups rows, VERBATIM.
// The PATH lives under /api/orders because the order id is the key the caller
// holds; the HANDLER lives here because this feature owns the table.
export const getPickupsByOrder = asyncHandler(async (req, res) => {
  return res.json(await pickupService.forOrder(uuidParam(req, "orderId")));
});
