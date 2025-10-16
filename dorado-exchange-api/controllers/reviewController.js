import * as reviewService from "../services/reviewService.js";

export async function getOne(req, res, next) {
  try {
    const review = await reviewService.getReview(req.query.review_id);
    return res.status(200).json(review);
  } catch (err) {
    return next(err);
  }
}

export async function getAll(req, res, next) {
  try {
    const reviews = await reviewService.getAllReviews();
    return res.status(200).json(reviews);
  } catch (err) {
    return next(err);
  }
}

export async function createReview(req, res, next) {
  try {
    const review = await reviewService.createReview(req.body.review);
    return res.status(200).json(review);
  } catch (err) {
    return next(err);
  }
}

export async function updateReview(req, res, next) {
  try {
    const review = await reviewService.updateReview(req.body.review, req.body.user_name);
    return res.status(200).json(review);
  } catch (err) {
    return next(err);
  }
}

export async function deleteReview(req, res, next) {
  try {
    const review = await reviewService.deleteReview(req.body.review_id,);
    return res.status(200).json(review);
  } catch (err) {
    return next(err);
  }
}
