-- The lines as an ORDER needs them: the metal resolved through the product
-- when the line does not carry one (orders.items.metal_id is NOT NULL; a
-- product knows its own metal and a scrap line already has one).
SELECT i.id, i.bullion_id,
       coalesce(i.metal_id, b.metal_id) AS metal_id,
       i.pre_melt, i.post_melt, i.purity, i.content, i.unit,
       i.premium, i.quantity
  FROM checkout.items i
  LEFT JOIN products.bullion b ON b.id = i.bullion_id
 WHERE i.checkout_id = $1
 ORDER BY i.created_at, i.id
