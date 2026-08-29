import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as handoffsService from "#features/shipping/handoffs/service.ts";
import { oneString } from "#shared/http/query.ts";

// GET /api/shipping/handoffs[?carrier_id=]
//
// Reference data the frontend maps against by `code` (ruling 12: rows out, ids
// in). It renders `name`, and it branches on `requires_schedule` /
// `has_dropoff_locations` instead of on a carrier's enum values - which is the
// whole point of the read existing.
export const getAll = asyncHandler(async (req, res) => {
  const carrier_id = oneString(req.query.carrier_id);
  const result = await handoffsService.getHandoffs(carrier_id);
  return res.status(200).json(result);
});
