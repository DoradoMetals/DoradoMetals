-- One row, by id. Columns are listed rather than *: user_id, order_id, created_by_id, updated_by_id must not reach the wire.
SELECT id, name, review_text, rating, hidden, created_at, updated_at,
       created_by, updated_by
  FROM reviews.reviews
 WHERE id = $1
