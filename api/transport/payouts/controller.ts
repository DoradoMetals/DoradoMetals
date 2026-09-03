import { exchange } from "@dorado/contracts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { parseStrict, uuidParam } from "#shared/http/validate.ts";
import * as payoutsService from "#domain/payouts/service.ts";

// GET /api/orders/:orderId/payouts - the payouts on one order, as rows.
// The full routing and account numbers are not columns of this read at all;
// they have exactly one endpoint, GET /payouts/:id/details.
export const getPayoutsByOrder = asyncHandler(async (req, res) => {
  return res.json(await payoutsService.getPayoutsByOrder(uuidParam(req, "orderId")));
});

// PATCH /api/payouts/:id - the body is parsed strictly against the contract
// before the service runs, and the answer is the payout row the write produced.
export const patchPayout = asyncHandler(async (req, res) => {
  const id = uuidParam(req, "id");
  const patch = parseStrict(exchange.payouts.Patch, req.body ?? {}, "payouts PATCH body");
  return res.status(200).json(await payoutsService.patchPayout(id, patch));
});

// GET /api/payouts/:id/details - the full bank numbers, admin only. The
// RADIOACTIVE rule is absolute: details exist only here, never in an order.
export const getPayoutDetails = asyncHandler(async (req, res) => {
  const id = uuidParam(req, "id");
  const details = await payoutsService.getDetails(id);
  if (!details) {
    return res.status(404).json({ error: "Not Found", message: `no payout ${id}` });
  }
  return res.status(200).json(details);
});
