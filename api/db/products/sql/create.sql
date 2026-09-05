INSERT INTO products.bullion
       (name, metal_id, mint_id, supplier_id,
        image_front, image_back, stock, quantity)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING id
