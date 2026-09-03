-- What the refinery reported for a set of order lines.
--
-- The refiner's counterpart to a line: what came back once the scrap was
-- melted, as against what the customer declared. 064 made this one row per
-- purchase-order line, so the relationship is one-to-one and every value is
-- null until a refiner reports.
--
-- ADMIN-ONLY. These are the assay actuals, and a customer read must not carry
-- them - the service decides, and the two order reads differ by exactly whether
-- they call this.
SELECT id, order_item_id, refiner_id, bullion_id, metal_id,
       pre_melt, post_melt, purity, content, premium, quantity, unit
  FROM refiners.items
 WHERE order_item_id = ANY($1::uuid[])
 ORDER BY order_item_id ASC, id ASC
