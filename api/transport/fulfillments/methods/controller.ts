import { Direction, FulfillmentMethodUpdateBody } from "@dorado/contracts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { parseStrict } from "#shared/http/validate.ts";
import * as methodService from "#domain/fulfillments/methods/service.ts";

// The menu a customer is offered, per direction. Guarded rather than public:
// which methods exist and which are hidden is operational information, and a
// signed-out visitor has no order to fulfil.
export const getMethods = asyncHandler(async (req, res) => {
  const direction = parseStrict(Direction, req.query.direction, "direction");
  return res.status(200).json(await methodService.listAvailable(direction));
});

export const getAllMethods = asyncHandler(async (_req, res) => {
  return res.status(200).json(await methodService.listAll());
});

// The patch goes through as it arrived - a key present is written, a key
// absent leaves the column alone (shared/db/patch.ts). Re-spelling it here
// would be a second column list to keep in step with the contract's.
export const updateMethod = asyncHandler(async (req, res) => {
  const body = parseStrict(
    FulfillmentMethodUpdateBody, req.body, "fulfillments/methods/update body"
  );
  return res.status(200).json(await methodService.update(body.id, body.method));
});
