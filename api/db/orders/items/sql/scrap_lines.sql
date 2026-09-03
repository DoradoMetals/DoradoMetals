-- The scrap lines of one order with their metal NAMES - what premium
-- re-tiering prices from. bullion_id IS NULL is what distinguishes scrap;
-- bullion keeps its own per-product premium.
SELECT i.id, m.name AS metal, i.content
  FROM orders.items i
  JOIN metals.metals m ON m.id = i.metal_id
 WHERE i.order_id = $1 AND i.bullion_id IS NULL
