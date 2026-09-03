// HTTP in, HTTP out. No database, no composition, no business rules.
// Every body is parsed against the contract in strict mode: unknown keys and wrong types are a 400 before the service runs.
// created_by/updated_by/user_name are not fields of either body: public.audit_stamp writes the audit columns from the connection's actor, so a request naming any of the three is a 400, not a silently-ignored field.
import { z } from "zod/v4";
import { CreateLeadBody, LeadPatch } from "@dorado/contracts";
import { parseStrict, uuidLike } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as service from "#domain/leads/service.ts";

const leadId = uuidLike;

const CreateBody = z.object({
  lead: CreateLeadBody.strict(),
}).strict();

const UpdateBody = z.object({
  lead_id: leadId,
  patch: LeadPatch.strict().optional(),
}).strict();

const DeleteBody = z.object({ lead_id: leadId }).strict();

export const getOne = asyncHandler(async (req, res) => {
  const id = parseStrict(leadId, req.query.lead_id, "lead_id");
  const lead = await service.getOne(id);
  return res.status(200).json(lead);
});

export const getAll = asyncHandler(async (_req, res) => {
  return res.status(200).json(await service.list());
});

export const create = asyncHandler(async (req, res) => {
  const body = parseStrict(CreateBody, req.body, "leads/create body");
  return res.status(200).json(await service.create(body.lead));
});

// Takes lead_id and a patch - only the changed fields, not the whole row.
export const update = asyncHandler(async (req, res) => {
  const body = parseStrict(UpdateBody, req.body, "leads/update body");
  const lead = await service.update(body.lead_id, body.patch ?? {});
  return res.status(200).json(lead);
});

// 404 rather than 200 when the id matched nothing.
export const remove = asyncHandler(async (req, res) => {
  const body = parseStrict(DeleteBody, req.body, "leads/delete body");
  const removed = await service.remove(body.lead_id);
  if (!removed) return res.status(404).json({ message: "no such lead" });
  return res.status(200).json({ message: "Lead deleted" });
});
