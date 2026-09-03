-- One row, by id.
--
-- Columns are listed rather than selected with *: reviews.reviews carries
-- user_id, order_id, created_by_id, updated_by_id, which exchange.reviews has no equivalent for, and
-- they must not reach the wire while both schemas are serving
SELECT id, name, review_text, rating, hidden, created_at, updated_at,
       created_by, updated_by
  FROM reviews.reviews
 WHERE id = $1
