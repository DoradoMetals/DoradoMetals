SELECT i.id, i.bullion_id, i.metal_id,
       i.pre_melt, i.post_melt, i.purity, i.content, i.unit,
       i.premium, i.quantity
  FROM checkout.items i
 WHERE i.checkout_id = $1
 ORDER BY i.created_at, i.id
