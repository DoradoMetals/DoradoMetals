import { FulfillmentSchedulePickupBody } from "@dorado/contracts";
import { parseStrict, uuidParam } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as pickupService from "#domain/fulfillments/pickups/service.ts";

// POST /api/fulfillments/schedule_pickup - the fulfillment is named at the top
// level of the body, so there is nothing to assert here and nothing to spread:
// the id and the booking go to the service as they arrived.
export const schedulePickup = asyncHandler(async (req, res) => {
  const body = parseStrict(
    FulfillmentSchedulePickupBody, req.body, "fulfillments/schedule_pickup body"
  );
  return res.status(200).json(
    await pickupService.schedule(body.fulfillment_id, body.pickup)
  );
});

// GET /api/orders/:orderId/pickups - fulfillments.pickups rows, VERBATIM.
// The PATH lives under /api/orders because the order id is the key the caller
// holds; the HANDLER lives here because this feature owns the table.
export const getPickupsByOrder = asyncHandler(async (req, res) => {
  return res.json(await pickupService.forOrder(uuidParam(req, "orderId")));
});
