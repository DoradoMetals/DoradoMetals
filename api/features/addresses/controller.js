// Responses go out through toWire, which flattens the person's relationship to
// an address back onto the address itself - `name` and `is_default` at the top
// level - because that is what the frontend reads. ADDRESSES_WIRE=next turns it
// off. Requests come in through fromWire for the same reason.
import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as addressService from "#features/addresses/service.js"
import { toWire, fromWire } from "#features/addresses/wire.js";

export const getAll = asyncHandler(async (req, res) => {
  const { user_id } = req.query;
  const rows = await addressService.list(user_id);
  return res.status(200).json(toWire(rows));
});

export const create = asyncHandler(async (req, res) => {
  const { address, user_id } = req.body;
  const saved = await addressService.create({ address: fromWire(address), userId: user_id });
  return res.status(200).json(toWire(saved));
});

export const update = asyncHandler(async (req, res) => {
  const { address, user_id } = req.body;
  const saved = await addressService.update({ address: fromWire(address), userId: user_id });
  return res.status(200).json(toWire(saved));
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
