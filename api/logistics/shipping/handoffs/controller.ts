import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as handoffsService from "#logistics/shipping/handoffs/service.ts";
import { oneString } from "#shared/http/query.ts";

export const getAll = asyncHandler(async (req, res) => {
  const carrier_id = oneString(req.query.carrier_id);
  const result = await handoffsService.getHandoffs(carrier_id);
  return res.status(200).json(result);
});
