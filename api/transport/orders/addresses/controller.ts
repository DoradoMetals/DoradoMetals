import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { uuidParam } from "#shared/http/validate.ts";
import * as orderAddressService from "#domain/orders/addresses/service.ts";

export const getOrderAddress = asyncHandler(async (req, res) => {
  const id = uuidParam(req, "id");
  const snapshot = await orderAddressService.snapshotFor(id);
  if (!snapshot) {
    return res.status(404).json({
      error: "Not Found",
      message: `order ${id} has no address`,
    });
  }
  return res.json(snapshot);
});
