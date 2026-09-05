import { LeadPatch } from "@dorado/contracts";
import { requiredParam } from "#shared/http/caller.ts";
import { parseStrict } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as service from "#crm/leads/service.ts";

export const getOne = asyncHandler(async (req, res) => {
  const id = requiredParam(req.params.id, "id");
  const lead = await service.getOne(id);
  return res.status(200).json(lead);
});

export const getAll = asyncHandler(async (_req, res) => {
  return res.status(200).json(await service.list());
});

export const create = asyncHandler(async (req, res) => {
  const body = parseStrict(LeadPatch.strict(), req.body, "leads/create body");
  const lead = await service.create(body);
  return res.status(201).json(lead);
});

export const update = asyncHandler(async (req, res) => {
  const id = requiredParam(req.params.id, "id");
  const body = parseStrict(LeadPatch.strict(), req.body, "leads/update body");
  const lead = await service.update(id, body);
  return res.status(200).json(lead);
});

export const remove = asyncHandler(async (req, res) => {
  const id = requiredParam(req.params.id, "id");
  const removed = await service.remove(id);
  if (!removed) return res.status(404).json({ message: "no such lead" });
  return res.status(200).json({ message: "Lead deleted" });
});
