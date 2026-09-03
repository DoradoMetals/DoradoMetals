import { param } from "#shared/http/caller.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as orderAddressService from "#domain/orders/addresses/service.ts";

// GET /api/orders/:id/address - the address SNAPSHOT, verbatim.
export const getOrderAddress = asyncHandler(async (req, res) => {
  const snapshot = await orderAddressService.snapshotFor(param(req, "id"));
  if (!snapshot) {
    return res.status(404).json({
      error: "Not Found",
      message: `order ${param(req, "id")} has no address`,
    });
  }
  return res.json(snapshot);
});
