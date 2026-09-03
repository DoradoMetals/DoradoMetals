-- The lines of one order.
--
-- A SCRAP LINE'S WEIGHTS ARE ON THE LINE ITSELF. exchange.scrap does not exist
-- in this schema: a scrap row was never an entity anyone referred to, so
-- pre_melt, post_melt, purity and content are columns here. That is why
-- features/scrap has no table to migrate and its repo is deleted rather than
-- converted.
--
-- bullion_id is what tells the two kinds apart - null means scrap.
SELECT id, order_id, bullion_id, metal_id, pre_melt, post_melt, purity, content,
       premium, quantity, confirmed, sales_tax_charged, unit, price
  FROM orders.items
 WHERE order_id = $1
 ORDER BY id ASC
