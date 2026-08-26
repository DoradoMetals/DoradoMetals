// Reviews read from exchange.reviews, the schema currently serving traffic.
//
// Every function takes an optional trailing executor so the dual-write phase
// can apply the write here and its mirror into core atomically.
import query from "#shared/db/query.js";

// The columns are listed rather than selected with *, so that a column added to
// exchange.reviews shows up as a difference against repo.next.ts rather than
// silently widening what the API returns.

export async function getReview(id, executor) {
  const sql = `
    SELECT
     id, review_text, created_at, updated_at, rating, created_by,
     updated_by, name, hidden
    FROM exchange.reviews
    WHERE id = $1
  `;
  const values = [id];
  const result = await query(sql, values, executor);
  return result.rows[0];
}

export async function getAllReviews(executor) {
  const sql = `
    SELECT
     id, review_text, created_at, updated_at, rating, created_by,
     updated_by, name, hidden
    FROM exchange.reviews
    ORDER BY created_at DESC, id DESC
  `;
  const result = await query(sql, [], executor);
  return result.rows
}

export async function getPublicReviews(executor) {
  const sql = `
    SELECT
     id, review_text, created_at, updated_at, rating, created_by,
     updated_by, name, hidden
    FROM exchange.reviews
    WHERE hidden = false
    ORDER BY created_at DESC, id DESC
    LIMIT 10
  `;
  const result = await query(sql, [], executor);
  return result.rows
}


export async function createReview(review, executor) {
  const sql = `
    INSERT INTO exchange.reviews (review_text, rating, created_by, updated_by, name, hidden)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;
  `;
  const values = [
    review.review_text,
    review.rating,
    review.created_by,
    review.updated_by,
    review.name,
    review.hidden,
  ];
  const result = await query(sql, values, executor);
  return result.rows[0];
}

export async function updateReview(review, user_name, executor) {
  const sql = `
    UPDATE exchange.reviews
    SET review_text = $1,
        rating = $2,
        updated_at = NOW(),
        updated_by = $3,
        name = $4,
        hidden = $5,
        created_at = $6
    WHERE id = $7
    RETURNING *;
  `;

  const values = [
    review.review_text,
    review.rating,
    user_name,
    review.name,
    review.hidden,
    review.created_at,
    review.id,
  ];

  const result = await query(sql, values, executor);
  return result.rows[0];
}

export async function deleteReview(id, executor) {
  const sql = `
    DELETE FROM exchange.reviews WHERE id = $1
  `;
  const values = [id];
  return await query(sql, values, executor);
}
