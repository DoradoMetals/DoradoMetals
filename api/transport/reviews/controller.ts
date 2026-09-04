// HTTP in, HTTP out. No database, no composition, no business rules.
// Every body is parsed against the contract in strict mode: unknown keys and wrong types are a 400 before the service runs.
// created_by/updated_by/user_name are not fields of either body: public.audit_stamp writes the audit columns from the connection's actor, so a request naming any of the three is a 400.
import { ReviewPatch } from "@dorado/contracts";
import { requiredParam } from "#shared/http/caller.ts";
import { parseStrict } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as service from "#domain/reviews/service.ts";

export const getOne = asyncHandler(async (req, res) => {
  const id = requiredParam(req.params.id, "id");
  return res.status(200).json(await service.getOne(id));
});

export const getAll = asyncHandler(async (_req, res) => {
  return res.status(200).json(await service.list());
});

// The only unguarded route in this feature: a different statement from list, not the same one filtered, so no argument can reach a hidden review.
export const getPublic = asyncHandler(async (_req, res) => {
  return res.status(200).json(await service.getPublic());
});

export const create = asyncHandler(async (req, res) => {
  const body = parseStrict(ReviewPatch.strict(), req.body, "reviews/create body");
  const review = await service.create(body);
  return res.status(201).json(review);
});

// Takes the id from the path and a patch body - only the changed fields, not the whole row.
export const update = asyncHandler(async (req, res) => {
  const id = requiredParam(req.params.id, "id");
  const body = parseStrict(ReviewPatch.strict(), req.body, "reviews/update body");
  const review = await service.update(id, body);
  return res.status(200).json(review);
});

export const remove = asyncHandler(async (req, res) => {
  const id = requiredParam(req.params.id, "id");
  const removed = await service.remove(id);
  if (!removed) return res.status(404).json({ message: "no such review" });
  return res.status(200).json({ message: "Review deleted" });
});
