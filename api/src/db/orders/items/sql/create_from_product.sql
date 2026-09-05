INSERT INTO orders.items
       (id, order_id, bullion_id, metal_id, pre_melt, post_melt, purity,
        content, quantity, confirmed, unit)
SELECT gen_random_uuid(), $1, b.id, b.metal_id, b.gross, b.content, b.purity,
       b.content, 1, false, 't oz'
  FROM products.bullion b
 WHERE b.id = $2
RETURNING *
