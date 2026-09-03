// HTTP in, HTTP out. No database, no composition, no business rules.
//
// EVERY BODY IS PARSED AGAINST THE CONTRACT, IN STRICT MODE. Unknown keys and
// wrong types are a 400 here, before the service ever runs - the service
// checks RULES (does this id exist, is the caller allowed), never shapes.
//
// created_by/updated_by ride along as OPTIONAL on both schemas below (a
// caller may still send them) but are ignored either way: the actor argument
// is what the service and repo actually write into those columns, never the
// row/patch (Jacob's correction on this batch - audit fields are not the
// client's to set). CreateReviewBody and the patch schema both derive from
// the one contract export, `.partial`/`.omit` rather than hand-written, so
// this feature has no coverage gap the way leads' patch does.
//
// `hidden` IS RE-EXTENDED NON-NULLABLE. CreateReviewBody still derives from
// the legacy exchange.reviews shape, where hidden was nullable; reviews.reviews
// (the native table this repo now writes) declares it `boolean NOT NULL`, and
// the old service coerced the gap away with `hidden ?? false` - exactly the
// prop-spreading this batch removes. The default now lives in create.sql's
// own `COALESCE($n, false)` (rule 4), so the wire only needs to refuse a
// literal null rather than silently launder it.
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

// The only unguarded route in this feature. It answers a DIFFERENT statement
// from list rather than the same one filtered, so an anonymous visitor cannot
// reach a hidden review by any argument they can send.
export const getPublic = asyncHandler(async (_req, res) => {
  return res.status(200).json(await service.getPublic());
});

export const create = asyncHandler(async (req, res) => {
  const body = parseStrict(CreateBody, req.body, "reviews/create body");
  return res.status(200).json(await service.create(body.review, body.user_name));
});

// TAKES review_id AND A PATCH - the client sends the id it already holds plus
// only the fields that changed, not the whole row it read earlier.
export const update = asyncHandler(async (req, res) => {
  const body = parseStrict(UpdateBody, req.body, "reviews/update body");
  const review = await service.update(body.review_id, body.patch ?? {}, body.user_name);
  return res.status(200).json(review);
});

export const remove = asyncHandler(async (req, res) => {
  const body = parseStrict(DeleteBody, req.body, "reviews/delete body");
  const removed = await service.remove(body.review_id);
  if (!removed) return res.status(404).json({ message: "no such review" });
  return res.status(200).json({ message: "Review deleted" });
});
