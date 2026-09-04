SELECT id, display
  FROM products.bullion
 WHERE id = ANY($1::uuid[])
