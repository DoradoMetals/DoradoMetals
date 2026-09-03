// HTTP in, HTTP out. No database, no composition, no business rules.
//
// EVERY BODY IS PARSED AGAINST THE CONTRACT, IN STRICT MODE. Unknown keys and
// wrong types are a 400 here, before the service ever runs.
//
// created_by/updated_by are OMITTED from both schemas below, not merely
// optional: RateInput already declared them optional (the service used to
// overwrite them from user_name when one was sent), and the actor argument is
// now the ONLY way those columns get written (Jacob's correction on this
// batch) - so a caller naming them is a 400, the same as any other unknown
// field. The patch schema derives from the same contract export via
// `.omit`/`.partial`, not hand-written, so rates has no coverage gap.
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
  const rate = await rateService.createRate(body.rate, body.user_name);
  return res.status(200).json(rate);
});

// TAKES rate_id AND A PATCH - the client sends the id it already holds plus
// only the fields that changed, not the whole row it read earlier.
export const updateRate = asyncHandler(async (req, res) => {
  const body = parseStrict(UpdateBody, req.body, "rates/update body");
  const rate = await rateService.updateRate(body.rate_id, body.patch ?? {}, body.user_name);
  return res.status(200).json(rate);
});

export const deleteRate = asyncHandler(async (req, res) => {
  const body = parseStrict(DeleteBody, req.body, "rates/delete body");
  const result = await rateService.deleteRate(body.rate_id);
  return res.status(200).json(result);
});
