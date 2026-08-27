-- Mirror of sql/update.sql against the schema still serving as record of truth.
UPDATE exchange.reviews
   SET name = $1,
       review_text = $2,
       rating = $3,
       hidden = $4,
       created_by = $5,
       updated_by = $6,
       updated_at = NOW()
 WHERE id = $7
RETURNING id
