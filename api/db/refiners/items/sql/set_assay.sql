-- The refinery's assay report for one line - what actually came back once the
-- metal was melted. These lived on exchange.scrap as *_actual columns; here
-- they ARE the refiner line's own weights (migration 064's shape), beside the
-- declared weights that stay on orders.items.
--
-- content is COMPUTED BY THE CALLER, same rule as orders/items/sql/update_scrap.sql:
-- the unit conversion is a JavaScript table, and two definitions of content
-- would drift.
UPDATE refiners.items
   SET pre_melt = $1, post_melt = $2, purity = $3, content = $4
 WHERE order_item_id = $5
RETURNING id, order_item_id, pre_melt, post_melt, purity, content
