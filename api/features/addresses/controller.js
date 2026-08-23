import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as addressService from "#features/addresses/service.js"

export const getAll = asyncHandler(async (req, res) => {
  const { user_id } = req.query;
  const rows = await addressService.list(user_id);
  return res.status(200).json(rows);
});

export const create = asyncHandler(async (req, res) => {
  const { address, user_id } = req.body;
  const saved = await addressService.create({ address: address, userId: user_id });
  return res.status(200).json(saved);
});

export const update = asyncHandler(async (req, res) => {
  const { address, user_id } = req.body;
  const saved = await addressService.update({ address: address, userId: user_id });
  return res.status(200).json(saved);
});

export const remove = asyncHandler(async (req, res) => {
  const { user_id, address } = req.body;
  const msg = await addressService.remove({ userId: user_id, addressId: address.id });
  return res.status(200).json(msg);
});

export const setDefault = asyncHandler(async (req, res) => {
  const { user_id, address } = req.body;
  const msg = await addressService.setDefault({ userId: user_id, addressId: address.id });
  return res.status(200).json(msg);
});
