-- One row, by id. Columns are listed rather than *: image_id, organization_id must not reach the wire.
SELECT id, name, type, country, created_at, updated_at
  FROM products.mints
 WHERE id = $1
