-- The same product in the schema still serving as record of truth, which
-- defaults everything this one does not name.
INSERT INTO exchange.products (id, created_by, updated_by, product_name)
VALUES ($1, $2, $2, $3)
RETURNING id
