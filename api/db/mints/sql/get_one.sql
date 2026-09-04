SELECT id, name, type, country, created_at, updated_at
  FROM products.mints
 WHERE id = $1
