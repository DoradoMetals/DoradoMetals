// HTTP in, HTTP out. No database, no composition, no business rules.
// Every body is parsed against the contract in strict mode: unknown keys and
// wrong types are a 400 before the service runs.
// created_by/updated_by are not fields of RatePatch at all - naming one is a
// 400. public.audit_stamp is the only writer of those columns.
import { RatePatch } from "@dorado/contracts";
import { strictBody, uuidParam } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as rateService from "#domain/rates/service.ts";

export const listRates = asyncHandler(async (_req, res) => {
  res.status(200).json(await rateService.listRates());
});

// The rates PAGE: a card per metal, a column per volume band, already
// labelled and ordered.
export const listTiers = asyncHandler(async (_req, res) => {
  res.status(200).json(await rateService.listTiers());
});

export const listAdminRates = asyncHandler(async (_req, res) => {
  res.status(200).json(await rateService.listAdminRates());
});

export const getRate = asyncHandler(async (req, res) => {
  res.status(200).json(await rateService.getRate(uuidParam(req, "id")));
});

export const createRate = asyncHandler(async (req, res) => {
  const patch = strictBody(RatePatch.strict(), req.body);
  res.status(201).json(await rateService.createRate(patch));
});

export const updateRate = asyncHandler(async (req, res) => {
  const patch = strictBody(RatePatch.strict(), req.body);
  res.status(200).json(await rateService.updateRate(uuidParam(req, "id"), patch));
});

export const deleteRate = asyncHandler(async (req, res) => {
  await rateService.deleteRate(uuidParam(req, "id"));
  res.status(204).end();
});
