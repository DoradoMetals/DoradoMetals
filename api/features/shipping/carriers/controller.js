// Responses go out through toWire, which renames organizations' `enabled` back
// to the `is_active` the frontend reads. CARRIERS_WIRE=next turns it off.
import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as carriersRepo from "#features/shipping/carriers/repo.js";
import { toWire, fromWire } from "#features/shipping/carriers/wire.js";

export const getAll = asyncHandler(async (req, res) => {
  const result = await carriersRepo.getAll();
  return res.status(200).json(toWire(result));
});

export const getOne = asyncHandler(async (req, res) => {
  const { id } = req.query;
  const result = await carriersRepo.getById(id);
  return res.status(200).json(toWire(result));
});

export const create = asyncHandler(async (req, res) => {
  const { carrier } = req.body;
  const result = await carriersRepo.create(fromWire(carrier));
  return res.status(201).json(toWire(result));
});

export const update = asyncHandler(async (req, res) => {
  const { carrier } = req.body;
  const result = await carriersRepo.update(fromWire(carrier));
  return res.status(200).json(toWire(result));
});

// remove() takes an id and this passed the whole request body, so the delete ran
// as `WHERE id = $1` against an object and died on `invalid input syntax for
// type uuid` - this endpoint has never once succeeded. The frontend sends
// { carrier_id }, not { id }: frontend/features/carriers/queries.ts:50.
//
// Second instance of the same mistake; features/shipping/services had it too.
export const remove = asyncHandler(async (req, res) => {
  await carriersRepo.remove(req.body.carrier_id);
  return res.status(200).json(true);
});
