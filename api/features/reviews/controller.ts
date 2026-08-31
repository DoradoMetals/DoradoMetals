// HTTP in, HTTP out. No database, no composition, no business rules.
import { requiredParam } from "#shared/http/caller.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as service from "#features/reviews/service.ts";

export const getOne = asyncHandler(async (req, res) => {
  return res.status(200).json(await service.getOne(requiredParam(req.query.review_id, "review_id")));
});

export const getAll = asyncHandler(async (_req, res) => {
  return res.status(200).json(await service.getAll());
});

// The only unguarded route in this feature. It answers a DIFFERENT statement
// from getAll rather than the same one filtered, so an anonymous visitor cannot
// reach a hidden review by any argument they can send.
export const getPublic = asyncHandler(async (_req, res) => {
  return res.status(200).json(await service.getPublic());
});

export const create = asyncHandler(async (req, res) => {
  return res.status(200).json(await service.create(req.body.review));
});

export const update = asyncHandler(async (req, res) => {
  return res.status(200).json(await service.update(req.body.review, req.body.user_name));
});

export const remove = asyncHandler(async (req, res) => {
  const removed = await service.remove(req.body.review_id);
  if (removed === 0) return res.status(404).json({ message: "no such review" });
  return res.status(200).json({ message: "Review deleted" });
});
