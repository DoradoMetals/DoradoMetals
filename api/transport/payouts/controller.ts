import { PayoutPatch } from "@dorado/contracts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { parseStrict, uuidParam } from "#shared/http/validate.ts";
import * as payoutsService from "#domain/payouts/service.ts";

export const getPayoutsByOrder = asyncHandler(async (req, res) => {
  return res.json(await payoutsService.getPayoutsByOrder(uuidParam(req, "orderId")));
});

export const patchPayout = asyncHandler(async (req, res) => {
  const id = uuidParam(req, "id");
  const patch = parseStrict(PayoutPatch, req.body ?? {}, "payouts PATCH body");
  return res.status(200).json(await payoutsService.patchPayout(id, patch));
});

export const getPayoutDetails = asyncHandler(async (req, res) => {
  const id = uuidParam(req, "id");
  const details = await payoutsService.getDetails(id);
  if (!details) {
    return res.status(404).json({ error: "Not Found", message: `no payout ${id}` });
  }
  return res.status(200).json(details);
});
