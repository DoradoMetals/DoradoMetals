// HTTP in, HTTP out. No database, no composition, no business rules.
import { requiredParam } from "#shared/http/caller.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as service from "#domain/reviews/service.ts";

export const getOne = asyncHandler(async (req, res) => {
  return res.status(200).json(await service.getOne(requiredParam(req.query.review_id, "review_id")));
});

export const getAll = asyncHandler(async (_req, res) => {
  return res.status(200).json(await service.list());
});

// The only unguarded route in this feature. It answers a DIFFERENT statement
// from list rather than the same one filtered, so an anonymous visitor cannot
// reach a hidden review by any argument they can send.
export const getPublic = asyncHandler(async (_req, res) => {
  return res.status(200).json(await service.getPublic());
});

export const create = asyncHandler(async (req, res) => {
  return res.status(200).json(await service.create(req.body.review));
});

// TAKES review_id AND A PATCH - the client sends the id it already holds plus
// only the fields that changed, not the whole row it read earlier.
export const update = asyncHandler(async (req, res) => {
  const id = requiredParam(req.body.review_id, "review_id");
  const review = await service.update(id, req.body.patch ?? {}, req.body.user_name);
  return res.status(200).json(review);
});

export const remove = asyncHandler(async (req, res) => {
  const removed = await service.remove(req.body.review_id);
  if (!removed) return res.status(404).json({ message: "no such review" });
  return res.status(200).json({ message: "Review deleted" });
});
