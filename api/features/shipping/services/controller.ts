import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as servicesRepo from "#features/shipping/services/repo.js";

export const getAll = asyncHandler(async (req, res) => {
  const result = await servicesRepo.getAll();
  return res.status(200).json(result);
});

export const getOne = asyncHandler(async (req, res) => {
  const { id } = req.query;
  const result = await servicesRepo.getById(id);
  return res.status(200).json(result);
});

export const getByCarrier = asyncHandler(async (req, res) => {
  const { carrier_id } = req.query;
  const result = await servicesRepo.getByCarrierId(carrier_id);
  return res.status(200).json(result);
});

export const create = asyncHandler(async (req, res) => {
  const { service } = req.body;
  const result = await servicesRepo.create(service);
  return res.status(201).json(result);
});

export const update = asyncHandler(async (req, res) => {
  const { service } = req.body;
  const result = await servicesRepo.update(service);
  return res.status(200).json(result);
});

// The frontend sends { id }, and the repo takes an id. Passing the whole body
// made every delete die on `invalid input syntax for type uuid`, so this
// endpoint has never once succeeded.
export const remove = asyncHandler(async (req, res) => {
  await servicesRepo.remove(req.body.id);
  return res.status(200).json(true);
});
