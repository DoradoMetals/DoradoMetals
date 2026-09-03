-- Every caller-supplied field.
--
-- updated_at is maintained here. Forty-two of the fifty-two UPDATE statements
-- against exchange do not maintain theirs, which is why a drifted row cannot be
-- spotted from its timestamp.
UPDATE reviews.reviews
   SET name = $1,
       review_text = $2,
       rating = $3,
       hidden = $4,
       created_by = $5,
       updated_by = $6,
       updated_at = NOW()
 WHERE id = $7
RETURNING id, name, review_text, rating, hidden, created_at, updated_at,
          created_by, updated_by
