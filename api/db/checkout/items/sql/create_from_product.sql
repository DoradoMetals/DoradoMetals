INSERT INTO checkout.items
       (checkout_id, bullion_id, metal_id, pre_melt, post_melt, purity,
        content, unit, premium, quantity)
SELECT c.id, b.id, b.metal_id, b.gross, b.content, b.purity,
       b.content, 't oz',
       CASE WHEN c.direction = 'sale' THEN b.ask_premium END,
       $3
  FROM checkout.checkouts c
  JOIN products.bullion b ON b.id = $2
 WHERE c.id = $1
   AND (c.direction <> 'sale' OR b.display = true)
RETURNING id, checkout_id, bullion_id, metal_id, pre_melt, post_melt, purity,
       content, unit, premium, quantity, created_at, updated_at,
       created_by, updated_by
