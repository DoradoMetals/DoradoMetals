// HTTP in, HTTP out. No database, no composition, no business rules.
// Every body is parsed against the contract in strict mode: unknown keys and wrong types are a 400 before the service runs.
// patch is NOT deeply validated: @dorado/contracts has no LeadPatch schema, only CreateLeadBody (names five of leads' ten patchable columns) - a known gap, not papered over.
import { z } from "zod/v4";
import { CreateLeadBody } from "@dorado/contracts";
import { parseStrict, uuidLike } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as service from "#domain/leads/service.ts";
import type { LeadPatch } from "#db/leads/repo.ts";

const leadId = uuidLike;

// created_by/updated_by/user_name are accepted but ignored, not forwarded: audit fields are written by public.audit_stamp, not the client.
const CreateBody = z.object({
  lead: CreateLeadBody.strict(),
  user_name: z.string().optional(),
}).strict();

const UpdateBody = z.object({
  lead_id: leadId,
  patch: z.record(z.string(), z.unknown()).optional(),
  user_name: z.string().optional(),
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
  // patch is not schema-checked (see header) - passed through as the caller sent it.
  const patch = (body.patch ?? {}) as LeadPatch;
  const lead = await service.update(body.lead_id, patch);
  return res.status(200).json(lead);
});

// 404 rather than 200 when the id matched nothing.
export const remove = asyncHandler(async (req, res) => {
  const body = parseStrict(DeleteBody, req.body, "leads/delete body");
  const removed = await service.remove(body.lead_id);
  if (!removed) return res.status(404).json({ message: "no such lead" });
  return res.status(200).json({ message: "Lead deleted" });
});
