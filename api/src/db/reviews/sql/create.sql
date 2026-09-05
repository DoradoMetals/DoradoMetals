INSERT INTO reviews.reviews
       (name, review_text, rating, hidden)
VALUES ($1, $2, $3, COALESCE($4, false))
RETURNING id, name, review_text, rating, hidden, created_at, updated_at,
          created_by, updated_by
