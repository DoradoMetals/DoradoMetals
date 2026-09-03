-- EVERY line of one order with its metal NAME - what premium re-tiering prices
-- from. A purchase prices BOTH kinds from rates.rates (Jacob, 2026-09-03), so
-- this can no longer filter to scrap: bullion_id says which percentage column
-- the band is read from (null = scrap_pct, set = bullion_pct) and quantity is
-- what turns a bullion line's PER-UNIT content into the metal it really is.
SELECT i.id, m.name AS metal, i.content, i.quantity, i.bullion_id
  FROM orders.items i
  JOIN metals.metals m ON m.id = i.metal_id
 WHERE i.order_id = $1
