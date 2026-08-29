import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as orderAddressService from "#features/orders/addresses/service.ts";

// GET /api/orders/:id/address - the address SNAPSHOT, verbatim.
export const getOrderAddress = asyncHandler(async (req, res) => {
  const snapshot = await orderAddressService.snapshotFor(req.params.id);
  if (!snapshot) {
    return res.status(404).json({
      error: "Not Found",
      message: `order ${req.params.id} has no address`,
    });
  }
  return res.json(snapshot);
});
