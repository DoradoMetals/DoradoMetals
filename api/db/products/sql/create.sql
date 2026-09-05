INSERT INTO products.bullion
       (name, metal_id, mint_id, supplier_id)
VALUES ($1, $2, $3, $4)
RETURNING id
