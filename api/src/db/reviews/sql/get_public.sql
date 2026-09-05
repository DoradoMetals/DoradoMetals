SELECT id, review_text, created_at, updated_at, rating,
       created_by, updated_by, name, hidden
  FROM reviews.reviews
 WHERE hidden = false
 ORDER BY created_at DESC, id DESC
