-- Every row, newest first.
--
-- created_at is not unique, so id breaks the tie. Without a unique ORDER BY the
-- rows come back in physical order, which changes as rows are updated.
SELECT id, name, review_text, rating, hidden, created_at, updated_at,
       created_by, updated_by
  FROM reviews.reviews
 ORDER BY created_at DESC, id DESC
