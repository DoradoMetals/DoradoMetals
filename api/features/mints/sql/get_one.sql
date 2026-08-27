-- One row, by id.
--
-- Columns are listed rather than selected with *: products.mints carries
-- image_id, organization_id, which exchange.mints has no equivalent for, and
-- they must not reach the wire while both schemas are serving
SELECT id, name, type, country, created_at, updated_at
  FROM products.mints
 WHERE id = $1
