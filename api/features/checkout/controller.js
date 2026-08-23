import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as cartService from "#features/checkout/service.js";

export const getCart = asyncHandler(async (req, res) => {
  await cartService.getCart(req.query.user_id);
  return res.status(200).json({ success: true });
});

export const syncCart = asyncHandler(async (req, res) => {
  await cartService.syncCart(req.body.user_id, req.body.cart);
  res.status(200).json({ message: "Cart synced successfully" });
});

export const getSellCart = asyncHandler(async (req, res) => {
  const items = await cartService.getSellCart(req.query.user_id);
  return res.status(200).json(items);
});

export const syncSellCart = asyncHandler(async (req, res) => {
  await cartService.syncSellCart(req.body.user_id, req.body.cart);
  return res.status(200).json({ message: "Sell cart synced successfully" });
});
