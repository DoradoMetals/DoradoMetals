-- What the refinery reported for a set of order lines — one row per line (one-to-one), null until a refiner reports.
-- ADMIN-ONLY: these are assay actuals, and a customer read must not carry them; the service decides by whether it calls this.
SELECT id, order_item_id, refiner_id, bullion_id, metal_id,
       pre_melt, post_melt, purity, content, premium, quantity, unit
  FROM refiners.items
 WHERE order_item_id = ANY($1::uuid[])
 ORDER BY order_item_id ASC, id ASC
