// HTTP in, HTTP out. No database, no composition, no business rules.
// Every body is parsed against the contract in strict mode: unknown keys and wrong types are a 400 before the service runs.
// created_by/updated_by/user_name are accepted but ignored, not forwarded: those columns are written by public.audit_stamp, not the client.
// hidden is re-extended non-nullable: CreateReviewBody derives from the legacy nullable shape, but reviews.reviews is NOT NULL and create.sql's own COALESCE supplies the default.
import { z } from "zod/v4";
import { CreateReviewBody } from "@dorado/contracts";
import { parseStrict, uuidLike } from "#shared/http/validate.ts";
import { asyncHandler } from "#shared/middleware/asyncHandler.ts";
import * as service from "#domain/reviews/service.ts";

const reviewId = uuidLike;
const nonNullHidden = { hidden: z.boolean().optional() };

const CreateBody = z.object({
  review: CreateReviewBody
    .partial({ created_by: true, updated_by: true })
    .extend(nonNullHidden)
    .strict(),
  user_name: z.string().optional(),
}).strict();

const PatchBody = CreateReviewBody
  .omit({ created_by: true, updated_by: true })
  .partial()
  .extend(nonNullHidden)
  .strict();

const UpdateBody = z.object({
  review_id: reviewId,
  patch: PatchBody.optional(),
  user_name: z.string().optional(),
}).strict();

const DeleteBody = z.object({ review_id: reviewId }).strict();

export const getOne = asyncHandler(async (req, res) => {
  const id = parseStrict(reviewId, req.query.review_id, "review_id");
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
  const body = parseStrict(CreateBody, req.body, "reviews/create body");
  return res.status(200).json(await service.create(body.review));
});

// Takes review_id and a patch - only the changed fields, not the whole row.
export const update = asyncHandler(async (req, res) => {
  const body = parseStrict(UpdateBody, req.body, "reviews/update body");
  const review = await service.update(body.review_id, body.patch ?? {});
  return res.status(200).json(review);
});

export const remove = asyncHandler(async (req, res) => {
  const body = parseStrict(DeleteBody, req.body, "reviews/delete body");
  const removed = await service.remove(body.review_id);
  if (!removed) return res.status(404).json({ message: "no such review" });
  return res.status(200).json({ message: "Review deleted" });
});
