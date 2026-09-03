import { orders } from "@dorado/contracts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as methodsService from "#domain/payments/methods/service.ts";
import { oneString } from "#shared/http/query.ts";
import { parseStrict } from "#shared/http/validate.ts";

// GET /api/payments/methods[?direction=sale|purchase]
//
// Reference data the frontend maps against by `type` (ruling 12: rows out,
// ids in). Icons stay a client-side map beside the selector - Jacob's
// standing call from the handoff conversion - so nothing visual rides here.
export const getMethods = asyncHandler(async (req, res) => {
  const raw = oneString(req.query.direction);
  const direction = raw == null ? null : parseStrict(orders.enums.Direction, raw, "direction");
  const result = await methodsService.getMethods(direction);
  return res.status(200).json(result);
});
