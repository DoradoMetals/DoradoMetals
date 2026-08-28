import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as shipmentPatch from "#features/shipping/shipments/patch.service.ts";

export const patchShipment = asyncHandler(async (req, res) => {
  const result = await shipmentPatch.patchShipment(req.params.id, req.body ?? {});
  return res.status(200).json(result);
});
