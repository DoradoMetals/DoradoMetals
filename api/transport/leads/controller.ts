// HTTP in, HTTP out. No database, no composition, no business rules.
//
// The controller's whole job is turning a request into service arguments and a
// service result into a status code. Everything it does here it does because
// HTTP requires it - reading a query parameter, choosing 404 over 200.
//
// EVERY BODY IS PARSED AGAINST THE CONTRACT, IN STRICT MODE. Unknown keys and
// wrong types are a 400 here, before the service ever runs - the service
// checks RULES (does this id exist, is the caller allowed), never shapes.
//
// patch IS NOT DEEPLY VALIDATED. leads has ten patchable columns
// (name/phone/email/last_contacted/converted/contacted/responded/contact/
// notes/priority) and @dorado/contracts has no LeadPatch schema - only
// CreateLeadBody, which names five of the ten and would silently reject a
// legitimate patch to the other five. Reported rather than papered over with
// a hand-written schema: this is the one gap in this feature's strict pass.
import { z } from "zod/v4";
import { CreateLeadBody } from "@dorado/contracts";
import { parseStrict, uuidLike } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as service from "#domain/leads/service.ts";
import type { LeadPatch } from "#db/leads/repo.ts";

const leadId = uuidLike;

// created_by/updated_by ride along as optional on CreateLeadBody (a caller
// MAY still send them) but are ignored - the actor argument is what the
// service and repo actually write, never the body (Jacob's correction on
// this batch: audit fields are not the client's to set).
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
  return res.status(200).json(await service.create(body.lead, body.user_name));
});

// TAKES lead_id AND A PATCH - the client sends the id it already holds plus
// only the fields that changed, not the whole row it read earlier.
export const update = asyncHandler(async (req, res) => {
  const body = parseStrict(UpdateBody, req.body, "leads/update body");
  // patch is not schema-checked (see header) - passed through as the caller
  // sent it, same as before this endpoint parsed anything strictly.
  const patch = (body.patch ?? {}) as LeadPatch;
  const lead = await service.update(body.lead_id, patch, body.user_name);
  return res.status(200).json(lead);
});

// 404 rather than 200 when the id matched nothing. The old implementation
// returned the pg QueryResult, so a delete of a non-existent id answered 200
// with a result object the frontend ignored.
export const remove = asyncHandler(async (req, res) => {
  const body = parseStrict(DeleteBody, req.body, "leads/delete body");
  const removed = await service.remove(body.lead_id);
  if (!removed) return res.status(404).json({ message: "no such lead" });
  return res.status(200).json({ message: "Lead deleted" });
});
