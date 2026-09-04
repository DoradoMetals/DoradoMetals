SELECT i.id, i.bullion_id,
       coalesce(i.metal_id, b.metal_id) AS metal_id,
       i.pre_melt, i.post_melt, i.purity, i.content, i.unit,
       i.premium, i.quantity
  FROM checkout.items i
  LEFT JOIN products.bullion b ON b.id = i.bullion_id
 WHERE i.checkout_id = $1
 ORDER BY i.created_at, i.id
