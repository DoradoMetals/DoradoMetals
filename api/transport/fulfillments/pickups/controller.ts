import { ScheduleFulfillmentPickupBody } from "@dorado/contracts";
import { parseStrict, uuidParam } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as pickupService from "#domain/fulfillments/pickups/service.ts";
import { z } from "zod/v4";

const ScheduleBody = z.object({ pickup: ScheduleFulfillmentPickupBody.strict() }).strict();

export const schedulePickup = asyncHandler(async (req, res) => {
  const body = parseStrict(ScheduleBody, req.body, "fulfillments/schedule_pickup body");
  return res.status(200).json(await pickupService.schedule(body.pickup));
});

// GET /api/orders/:orderId/pickups - fulfillments.pickups rows, VERBATIM.
// The PATH lives under /api/orders because the order id is the key the caller
// holds; the HANDLER lives here because this feature owns the table.
export const getPickupsByOrder = asyncHandler(async (req, res) => {
  return res.json(await pickupService.forOrder(uuidParam(req, "orderId")));
});
