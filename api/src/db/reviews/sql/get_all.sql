SELECT id, name, review_text, rating, hidden, created_at, updated_at,
       created_by, updated_by
  FROM reviews.reviews
 ORDER BY created_at DESC, id DESC
