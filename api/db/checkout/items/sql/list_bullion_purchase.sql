-- The BULLION lines of a PURCHASE session. A NARROWER PROJECTION THAN THE SALE
-- ONE, and it stays narrower: the sell-cart wire has never carried the tender
-- flags or the mint, and a schema migration never changes a wire shape.
SELECT ci.id AS cart_item_id,
       ci.bullion_id AS product_id,
       ci.quantity,
       b.id, b.name AS product_name, b.description AS product_description,
       b.type AS product_type, b.gross, b.purity, b.content, b.slug,
       b.bid_premium, b.ask_premium, b.image_front, b.image_back,
       b.shadow_offset, b.variant_group, b.variant_label,
       metal.name AS metal_type
  FROM checkout.items ci
  LEFT JOIN products.bullion b ON b.id = ci.bullion_id
  LEFT JOIN metals.metals metal ON metal.id = b.metal_id
 WHERE ci.checkout_id = $1 AND ci.bullion_id IS NOT NULL
 ORDER BY ci.id
