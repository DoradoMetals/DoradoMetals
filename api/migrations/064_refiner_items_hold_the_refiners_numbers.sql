-- refiners.items becomes the refiner's line, and is derived from exchange.
--
-- Jacob, 2026-08-23, on where the assay columns belong: "The item premium is the
-- same for scrap and bullion... The refiner_premium is moved to
-- refiners.items.premium" and "purity_actual/post_melt_actual etc - what that
-- actually is is refiner.items.content, i.e. what the refiner says the content
-- is. That's why refiner.items has an order_item_id, so that it knows its
-- counterpart."
--
-- That is the design, and it is right. What was missing is that no migration had
-- ever written this table: its rows in dev and production are January's, and
-- what they hold is a copy of the QUOTED values - what the customer declared -
-- rather than what the refiner reported. So the four assay columns on
-- orders.items had nowhere to go, which is exactly what audit:coverage kept
-- saying.
--
-- One row per purchase-order line. exchange does not record which lines went to
-- a refiner, so deriving "only the ones that did" is not possible; a line whose
-- refiner has not reported simply has nulls. That also makes the table
-- reproducible from exchange, which is what lets verify:backfill cover it.
--
-- refiner_id is the one thing exchange has never held. It is preserved where a
-- row already carries one - production's are all the same refiner - and left
-- null for anything derived. Same decision already recorded for refinery_id on
-- orders.orders. It is excluded from the backfill comparison for that reason.
--
-- A sales-order line never sees a refiner; 062 removed the ones January made.

ALTER TABLE refiners.items ALTER COLUMN refiner_id DROP NOT NULL;

-- What the refiner reported, for lines that already have a row.
UPDATE refiners.items ri
SET bullion_id = poi.product_id,
    metal_id   = coalesce(s.metal_id, pr.metal_id),
    pre_melt   = s.pre_melt,
    post_melt  = s.post_melt_actual,
    purity     = s.purity_actual,
    content    = s.content_actual,
    premium    = poi.refiner_premium,
    quantity   = coalesce(poi.quantity, 1),
    unit       = s.gross_unit
FROM exchange.purchase_order_items poi
LEFT JOIN exchange.scrap s     ON s.id  = poi.scrap_id
LEFT JOIN exchange.products pr ON pr.id = poi.product_id
WHERE ri.order_item_id = poi.id;

-- And a row for every purchase-order line that has none.
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
  AND NOT EXISTS (
    SELECT 1 FROM refiners.items ri WHERE ri.order_item_id = poi.id
  );
