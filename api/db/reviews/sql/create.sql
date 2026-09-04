INSERT INTO reviews.reviews
       (id, name, review_text, rating, hidden)
VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, COALESCE($5, false))
RETURNING id, name, review_text, rating, hidden, created_at, updated_at,
          created_by, updated_by
