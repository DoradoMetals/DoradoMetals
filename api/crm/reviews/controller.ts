import { ReviewPatch } from "@dorado/contracts";
import { requiredParam } from "#shared/http/caller.ts";
import { parseStrict } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as service from "#crm/reviews/service.ts";

export const getOne = asyncHandler(async (req, res) => {
  const id = requiredParam(req.params.id, "id");
  return res.status(200).json(await service.getOne(id));
});

export const getAll = asyncHandler(async (_req, res) => {
  return res.status(200).json(await service.list());
});

export const getPublic = asyncHandler(async (_req, res) => {
  return res.status(200).json(await service.getPublic());
});

export const create = asyncHandler(async (req, res) => {
  const body = parseStrict(ReviewPatch.strict(), req.body, "reviews/create body");
  const review = await service.create(body);
  return res.status(201).json(review);
});

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
