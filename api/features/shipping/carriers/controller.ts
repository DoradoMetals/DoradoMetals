import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as carriersRepo from "#features/shipping/carriers/repo.js";

export const getAll = asyncHandler(async (req, res) => {
  const result = await carriersRepo.getAll();
  return res.status(200).json(result);
});

export const getOne = asyncHandler(async (req, res) => {
  const { id } = req.query;
  const result = await carriersRepo.getById(id);
  return res.status(200).json(result);
});

export const create = asyncHandler(async (req, res) => {
  const { carrier } = req.body;
  const result = await carriersRepo.create(carrier);
  return res.status(201).json(result);
});

export const update = asyncHandler(async (req, res) => {
  const { carrier } = req.body;
  const result = await carriersRepo.update(carrier);
  return res.status(200).json(result);
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
