import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as orderItemsService from "#features/orders/items/service.ts";

export const getOrderItems = asyncHandler(async (req, res) => {
  return res.json(await orderItemsService.forOrder(req.params.id));
});

export const createOrderItem = asyncHandler(async (req, res) => {
  const updated = await orderItemsService.createForOrder(req.params.id, req.body ?? {});
  return res.status(200).json({ updated });
});

export const patchOrderItem = asyncHandler(async (req, res) => {
  const result = await orderItemsService.patchOrderItem(req.params.id, req.body ?? {});
  return res.status(200).json(result);
});

export const deleteOrderItem = asyncHandler(async (req, res) => {
  const result = await orderItemsService.deleteOrderItem(req.params.id);
  return res.status(200).json(result);
});
