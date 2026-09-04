INSERT INTO products.bullion
       (id, name, metal_id, mint_id, supplier_id,
        image_front, image_back, stock, quantity)
VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING id
