-- A new row. An explicit id wins; NULL generates one.
INSERT INTO reviews.reviews
       (id, name, review_text, rating, hidden, created_by, updated_by)
VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7)
RETURNING id, name, review_text, rating, hidden, created_at, updated_at,
          created_by, updated_by
