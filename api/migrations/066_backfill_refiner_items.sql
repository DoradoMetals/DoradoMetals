-- Derives the refiner's line from exchange, for a database built from nothing.
--
-- 064 did this as a correction against dev and production, where January had
-- already left rows behind. This is the same derivation stated as a backfill, so
-- verify:backfill picks it up by name and a fresh database gets the table
-- populated - without it, refiners.items would be empty on a build from
-- scratch and the four assay columns would have nowhere to come from.
--
-- One row per purchase-order line. exchange does not record which lines went to
-- a refiner, so a line whose refiner has not reported simply carries nulls.
--
-- refiner_id is the one column exchange has never held; it stays null here and
-- is preserved where a row already has one. It is excluded from the backfill
-- comparison for that reason.
--
-- Idempotent: the insert conflicts on order_item_id and updates in place.

INSERT INTO refiners.items (
  order_item_id, refiner_id, bullion_id, metal_id,
  pre_melt, post_melt, purity, content, premium, quantity, unit
)
SELECT
  poi.id, NULL, poi.product_id, coalesce(s.metal_id, pr.metal_id),
  s.pre_melt, s.post_melt_actual, s.purity_actual, s.content_actual,
  poi.refiner_premium, coalesce(poi.quantity, 1), s.gross_unit
FROM exchange.purchase_order_items poi
LEFT JOIN exchange.scrap s     ON s.id  = poi.scrap_id
LEFT JOIN exchange.products pr ON pr.id = poi.product_id
WHERE EXISTS (SELECT 1 FROM orders.items i WHERE i.id = poi.id)
  AND coalesce(s.metal_id, pr.metal_id) IS NOT NULL
ON CONFLICT (order_item_id) DO UPDATE SET
  bullion_id = EXCLUDED.bullion_id,
  metal_id   = EXCLUDED.metal_id,
  pre_melt   = EXCLUDED.pre_melt,
  post_melt  = EXCLUDED.post_melt,
  purity     = EXCLUDED.purity,
  content    = EXCLUDED.content,
  premium    = EXCLUDED.premium,
  quantity   = EXCLUDED.quantity,
  unit       = EXCLUDED.unit;
