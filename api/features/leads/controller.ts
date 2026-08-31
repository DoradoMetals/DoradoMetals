// HTTP in, HTTP out. No database, no composition, no business rules.
//
// The controller's whole job is turning a request into service arguments and a
// service result into a status code. Everything it does here it does because
// HTTP requires it - reading a query parameter, choosing 404 over 200.
import { requiredParam } from "#shared/http/caller.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as service from "#features/leads/service.ts";

export const getOne = asyncHandler(async (req, res) => {
  const lead = await service.getOne(requiredParam(req.query.lead_id, "lead_id"));
  return res.status(200).json(lead);
});

export const getAll = asyncHandler(async (_req, res) => {
  return res.status(200).json(await service.getAll());
});

export const create = asyncHandler(async (req, res) => {
  return res.status(200).json(await service.create(req.body.lead));
});

export const update = asyncHandler(async (req, res) => {
  return res.status(200).json(await service.update(req.body.lead, req.body.user_name));
});

// 404 rather than 200 when the id matched nothing. The old implementation
// returned the pg QueryResult, so a delete of a non-existent id answered 200
// with a result object the frontend ignored.
export const remove = asyncHandler(async (req, res) => {
  const removed = await service.remove(req.body.lead_id);
  if (removed === 0) return res.status(404).json({ message: "no such lead" });
  return res.status(200).json({ message: "Lead deleted" });
});
