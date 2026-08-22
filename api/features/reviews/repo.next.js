// Reviews read from reviews.reviews, the domain-namespaced schema the API is
// moving to. Differs from repo.exchange.js only in the table it names.
//
// reviews.reviews additionally has user_id and order_id, which exchange never
// recorded. They stay null until something is in a position to populate them.
// Reviews read from reviews.reviews, the schema currently serving traffic.
//
// Every function takes an optional trailing executor so the dual-write phase
// can apply the write here and its mirror into core atomically.
import query from "#shared/db/query.js";

export async function getReview(id, executor) {
  const sql = `
    SELECT id, review_text, created_at, updated_at, rating, created_by, updated_by, name, hidden
    FROM reviews.reviews
    WHERE id = $1
  `;
  const values = [id];
  const result = await query(sql, values, executor);
  return result.rows[0];
}

export async function getAllReviews(executor) {
  const sql = `
    SELECT id, review_text, created_at, updated_at, rating, created_by, updated_by, name, hidden
    FROM reviews.reviews
    ORDER BY created_at DESC
  `;
  const result = await query(sql, [], executor);
  return result.rows
}

export async function getPublicReviews(executor) {
  const sql = `
    SELECT id, review_text, created_at, updated_at, rating, created_by, updated_by, name, hidden
    FROM reviews.reviews
    WHERE hidden = false
    ORDER BY created_at DESC
    LIMIT 10
  `;
  const result = await query(sql, [], executor);
  return result.rows
}


export async function createReview(review, executor) {
  const sql = `
    INSERT INTO reviews.reviews (review_text, rating, created_by, updated_by, name, hidden)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, review_text, created_at, updated_at, rating, created_by, updated_by, name, hidden;
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
    UPDATE reviews.reviews
    SET review_text = $1,
        rating = $2,
        updated_at = NOW(),
        updated_by = $3,
        name = $4,
        hidden = $5,
        created_at = $6
    WHERE id = $7
    RETURNING id, review_text, created_at, updated_at, rating, created_by, updated_by, name, hidden;
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
    DELETE FROM reviews.reviews WHERE id = $1
  `;
  const values = [id];
  return await query(sql, values, executor);
}

// Copies a row from exchange.reviews, id included, creating or overwriting.
//
// Server-side rather than through a row that has already been read into
// JavaScript: pg materialises timestamps as JS Dates, which hold milliseconds,
// so a read-then-write round trip truncates the microseconds Postgres stores.
export async function mirrorReview(id, executor) {
  const cols = `id, review_text, created_at, updated_at, rating, created_by, updated_by, name, hidden`;
  const sql = `
    INSERT INTO reviews.reviews (${cols})
    SELECT ${cols} FROM exchange.reviews WHERE id = $1
    ON CONFLICT (id) DO UPDATE SET
      review_text = EXCLUDED.review_text, created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at, rating = EXCLUDED.rating,
      created_by = EXCLUDED.created_by, updated_by = EXCLUDED.updated_by,
      name = EXCLUDED.name, hidden = EXCLUDED.hidden
    RETURNING ${cols};
  `;
  const { rows } = await query(sql, [id], executor);
  return rows[0];
}
