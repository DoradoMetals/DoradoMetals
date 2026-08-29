-- The same row, written to the schema still serving as the record of truth.
-- The id is supplied so both schemas agree on it.
INSERT INTO exchange.reviews
       (id, name, review_text, rating, hidden, created_by, updated_by)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id
