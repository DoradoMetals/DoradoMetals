INSERT INTO orders.items
       (id, order_id, bullion_id, metal_id, pre_melt, post_melt, purity,
        content, quantity, confirmed, unit)
SELECT gen_random_uuid(), $1, i.bullion_id, coalesce(i.metal_id, b.metal_id),
       i.pre_melt, i.post_melt, i.purity, i.content,
       coalesce(i.quantity, 1), false, i.unit
  FROM checkout.items i
  LEFT JOIN products.bullion b ON b.id = i.bullion_id
 WHERE i.checkout_id = $2
 ORDER BY i.created_at, i.id
RETURNING *
