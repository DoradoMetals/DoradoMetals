import { z } from "zod/v4";
import { Direction, FulfillmentMethodPatch } from "@dorado/contracts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { parseStrict, uuidLike } from "#shared/http/validate.ts";
import * as methodService from "#domain/fulfillments/methods/service.ts";

const UpdateBody = z.object({
  method: FulfillmentMethodPatch.extend({ id: uuidLike }).strict(),
}).strict();

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

export const updateMethod = asyncHandler(async (req, res) => {
  const { method } = parseStrict(UpdateBody, req.body, "fulfillments/methods/update body");
  const saved = await methodService.update(method.id, {
    label: method.label, admin_label: method.admin_label,
    enabled: method.enabled, hidden: method.hidden,
  });
  return res.status(200).json(saved);
});
