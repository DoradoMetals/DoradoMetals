import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as carriersService from "#domain/shipping/carriers/service.ts";
import { oneString } from "#shared/http/query.ts";

export const getAll = asyncHandler(async (req, res) => {
  const result = await carriersService.getAllCarriers();
  return res.status(200).json(result);
});

export const getOne = asyncHandler(async (req, res) => {
  // Answers 200 with null when no id is given, rather than 400 - a deliberate change to make later.
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

// This endpoint had never once succeeded: it used to pass the whole body where an id was wanted. The frontend sends { carrier_id }, not { id } - the same mistake services/controller.ts had too.
export const remove = asyncHandler(async (req, res) => {
  await carriersService.removeCarrier(req.body.carrier_id);
  return res.status(200).json(true);
});
