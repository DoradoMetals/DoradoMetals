-- The reviews an anonymous visitor sees. `hidden = false` is the entire difference from get_all - kept as a separate statement, not a flag, since the route has no guard in front of it.
SELECT id, review_text, created_at, updated_at, rating,
       created_by, updated_by, name, hidden
  FROM reviews.reviews
 WHERE hidden = false
 ORDER BY created_at DESC, id DESC
