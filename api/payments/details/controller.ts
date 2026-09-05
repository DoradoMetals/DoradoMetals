import { PaymentDetailsPatch } from "@dorado/contracts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import { parseStrict, uuidParam } from "#shared/http/validate.ts";
import * as detailsService from "#payments/details/service.ts";

export const getPaymentDetails = asyncHandler(async (req, res) => {
  const id = uuidParam(req, "id");
  const view = await detailsService.getOne(id);
  if (!view) {
    return res.status(404).json({ error: "Not Found", message: `no payout ${id}` });
  }
  return res.status(200).json(view);
});

export const patchPaymentDetails = asyncHandler(async (req, res) => {
  const id = uuidParam(req, "id");
  const patch = parseStrict(PaymentDetailsPatch, req.body ?? {}, "payments/details PATCH body");
  return res.status(200).json(await detailsService.patchDetails(id, patch));
});

export const getPaymentDetailsBank = asyncHandler(async (req, res) => {
  const id = uuidParam(req, "id");
  const bank = await detailsService.getBank(id);
  if (!bank) {
    return res.status(404).json({ error: "Not Found", message: `no payout ${id}` });
  }
  return res.status(200).json(bank);
});

export const getOrderPaymentDetails = asyncHandler(async (req, res) => {
  return res.json(await detailsService.getForOrder(uuidParam(req, "orderId")));
});
