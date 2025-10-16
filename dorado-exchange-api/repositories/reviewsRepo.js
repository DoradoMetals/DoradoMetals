import pool from "../db.js";

export async function getReview(id) {
  const query = `
    SELECT *
    FROM exchange.reviews
    WHERE id = $1
  `;
  const values = [id];
  const result = await pool.query(query, values);
  return result.rows[0];
}

export async function getAllReviews(id) {
  const query = `
    SELECT *
    FROM exchange.reviews
    ORDER BY created_at DESC
  `;
  const result = await pool.query(query, []);
  return result.rows
}

export async function createReview(review) {
  const query = `
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
  const result = await pool.query(query, values);
  return result.rows[0];
}

export async function updateReview(review, user_name) {
  const query = `
    UPDATE exchange.reviews
    SET review_text = $1,
        rating = $2,
        updated_at = NOW(),
        updated_by = $3,
        name = $4,
        hidden = $5
    WHERE id = $6
    RETURNING *;
  `;

  const values = [
    review.review_text,
    review.rating,
    user_name,
    review.name,
    review.hidden,
    review.id,
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
}

export async function deleteReview(id) {
  const query = `
    DELETE FROM exchange.reviews WHERE id = $1
  `;
  const values = [id];
  return await pool.query(query, values);
}
