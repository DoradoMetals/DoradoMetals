import { param } from "#shared/http/caller.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as orderItemsService from "#features/orders/items/service.ts";

export const getOrderItems = asyncHandler(async (req, res) => {
  return res.json(await orderItemsService.forOrder(param(req, "id")));
});

export const createOrderItem = asyncHandler(async (req, res) => {
  const updated = await orderItemsService.createForOrder(param(req, "id"), req.body ?? {});
  return res.status(200).json({ updated });
});

export const patchOrderItem = asyncHandler(async (req, res) => {
  const result = await orderItemsService.patchOrderItem(param(req, "id"), req.body ?? {});
  return res.status(200).json(result);
});

export const deleteOrderItem = asyncHandler(async (req, res) => {
  const result = await orderItemsService.deleteOrderItem(param(req, "id"));
  return res.status(200).json(result);
});
