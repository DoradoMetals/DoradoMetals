import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as carriersService from "#features/shipping/carriers/service.ts";
import { oneString } from "#shared/http/query.ts";

export const getAll = asyncHandler(async (req, res) => {
  const result = await carriersService.getAllCarriers();
  return res.status(200).json(result);
});

export const getOne = asyncHandler(async (req, res) => {
  // Answers 200 with null when no id is given, rather than 400. That is what
  // this endpoint has always done - the id went into `WHERE id = $1` as
  // undefined, which node-postgres sends as null, which matches no row. A 400
  // would be the better answer and is a deliberate change to make later.
  const id = oneString(req.query.id);
  const result = id ? await carriersService.getCarrierById(id) : null;
  return res.status(200).json(result);
});

export const create = asyncHandler(async (req, res) => {
  const { carrier } = req.body;
  const result = await carriersService.createCarrier(carrier);
  return res.status(201).json(result);
});

export const update = asyncHandler(async (req, res) => {
  const { carrier } = req.body;
  const result = await carriersService.updateCarrier(carrier);
  return res.status(200).json(result);
});

// remove() takes an id and this passed the whole request body, so the delete ran
// as `WHERE id = $1` against an object and died on `invalid input syntax for
// type uuid` - this endpoint has never once succeeded. The frontend sends
// { carrier_id }, not { id }: frontend/features/carriers/queries.ts:50.
//
// Second instance of the same mistake; features/shipping/services had it too.
export const remove = asyncHandler(async (req, res) => {
  await carriersService.removeCarrier(req.body.carrier_id);
  return res.status(200).json(true);
});
