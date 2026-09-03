// HTTP in, HTTP out. No database, no composition, no business rules.
// Every body is parsed against the contract in strict mode: unknown keys and wrong types are a 400 before the service runs.
// created_by/updated_by are omitted, not merely optional - naming one is a 400. public.audit_stamp is now the only writer of those columns.
import { z } from "zod/v4";
import { RateInput } from "@dorado/contracts";
import { parseStrict, uuidLike } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as rateService from "#domain/rates/service.ts"

const rateId = uuidLike;

const RateBody = RateInput.omit({ created_by: true, updated_by: true }).strict();

const CreateBody = z.object({
  rate: RateBody,
  user_name: z.string().optional(),
}).strict();

const UpdateBody = z.object({
  rate_id: rateId,
  patch: RateBody.partial().optional(),
  user_name: z.string().optional(),
}).strict();

const DeleteBody = z.object({ rate_id: rateId }).strict();

export const getOne = asyncHandler(async (req, res) => {
  const id = parseStrict(rateId, req.query.rate_id, "rate_id");
  const rate = await rateService.getRate(id);
  return res.status(200).json(rate);
});

export const getAll = asyncHandler(async (req, res) => {
  const rates = await rateService.getAllRates();
  return res.status(200).json(rates);
});

export const getAdmin = asyncHandler(async (req, res) => {
  const rates = await rateService.getAdminRates();
  return res.status(200).json(rates);
});

export const createRate = asyncHandler(async (req, res) => {
  const body = parseStrict(CreateBody, req.body, "rates/create body");
  const rate = await rateService.createRate(body.rate);
  return res.status(200).json(rate);
});

// Takes rate_id and a patch - only the changed fields, not the whole row.
export const updateRate = asyncHandler(async (req, res) => {
  const body = parseStrict(UpdateBody, req.body, "rates/update body");
  const rate = await rateService.updateRate(body.rate_id, body.patch ?? {});
  return res.status(200).json(rate);
});

export const deleteRate = asyncHandler(async (req, res) => {
  const body = parseStrict(DeleteBody, req.body, "rates/delete body");
  const result = await rateService.deleteRate(body.rate_id);
  return res.status(200).json(result);
});
