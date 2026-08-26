import { asyncHandler } from "#shared/middleware/asyncHandler.js";
import * as reviewService from "#features/reviews/service.ts"

export const getOne = asyncHandler(async (req, res) => {
  const review = await reviewService.getReview(req.query.review_id);
  return res.status(200).json(review);
});

export const getAll = asyncHandler(async (req, res) => {
  const reviews = await reviewService.getAllReviews();
  return res.status(200).json(reviews);
});

export const getPublic = asyncHandler(async (req, res) => {
  const reviews = await reviewService.getPublicReviews();
  return res.status(200).json(reviews);
});

export const createReview = asyncHandler(async (req, res) => {
  const review = await reviewService.createReview(req.body.review);
  return res.status(200).json(review);
});

export const updateReview = asyncHandler(async (req, res) => {
  const review = await reviewService.updateReview(req.body.review, req.body.user_name);
  return res.status(200).json(review);
});

export const deleteReview = asyncHandler(async (req, res) => {
  const review = await reviewService.deleteReview(req.body.review_id);
  return res.status(200).json(review);
});
