SELECT id, name, review_text, rating, hidden, created_at, updated_at,
       created_by, updated_by
  FROM reviews.reviews
 WHERE id = $1
