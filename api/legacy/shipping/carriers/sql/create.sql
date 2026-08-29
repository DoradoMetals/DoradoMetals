-- The same carrier in the schema still serving as record of truth, where the
-- organization's fields sit on the carrier's own row. is_active is exchange's
-- name for the organization's `enabled`.
INSERT INTO exchange.carriers (id, name, email, phone, logo, is_active)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id
