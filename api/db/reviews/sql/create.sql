-- A new row. The id is supplied by the service, not generated here, so that
-- both schemas end up with the same primary key.
INSERT INTO reviews.reviews
       (id, name, review_text, rating, hidden, created_by, updated_by)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, name, review_text, rating, hidden, created_at, updated_at,
          created_by, updated_by
