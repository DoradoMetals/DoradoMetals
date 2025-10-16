import * as  reviewsRepo from "../repositories/reviewRepo.js";

export async function getReview(id) {
  return await reviewsRepo.getReview(id);
}

export async function getAllReviews() {
  return await reviewsRepo.getAllReviews();
}

export async function createReview(review) {
  return await reviewsRepo.createReview(lead)
}

export async function updateReview(review, user_name) {
  return await reviewsRepo.updateReview(review, user_name)
}

export async function deleteReview(id) {
  return reviewsRepo.deleteReview(id);
}
