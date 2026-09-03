-- Every mint, ordered by name (not created_at) since this feeds an alphabetical admin picker.
-- `description` and `website` are not projected: products.mints has no equivalent and neither has ever been on this wire.
SELECT id, name, type, country, created_at, updated_at
  FROM products.mints
 ORDER BY name ASC, id ASC
