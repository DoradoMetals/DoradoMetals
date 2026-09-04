import { z } from "zod/v4";
import { CarrierDeleteBody, CarrierPatch } from "@dorado/contracts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as carriersService from "#domain/shipping/carriers/service.ts";
import { oneString } from "#shared/http/query.ts";
import { parseStrict } from "#shared/http/validate.ts";

const CreateBody = z.object({ carrier: CarrierPatch }).strict();
const UpdateBody = z.object({ carrier: CarrierPatch }).strict();

export const getAll = asyncHandler(async (req, res) => {
  const result = await carriersService.getAllCarriers();
  return res.status(200).json(result);
});

export const getOne = asyncHandler(async (req, res) => {
  const id = oneString(req.query.id);
  const result = id ? await carriersService.getCarrierById(id) : null;
  return res.status(200).json(result);
});

export const create = asyncHandler(async (req, res) => {
  const body = parseStrict(CreateBody, req.body, "carriers/create body");
  const result = await carriersService.createCarrier(body.carrier);
  return res.status(201).json(result);
});

export const update = asyncHandler(async (req, res) => {
  const body = parseStrict(UpdateBody, req.body, "carriers/update body");
  const result = await carriersService.updateCarrier(body.carrier);
  return res.status(200).json(result);
});

export const remove = asyncHandler(async (req, res) => {
  const body = parseStrict(CarrierDeleteBody, req.body, "carriers/delete body");
  await carriersService.removeCarrier(body.carrier_id);
  return res.status(200).json(true);
});
