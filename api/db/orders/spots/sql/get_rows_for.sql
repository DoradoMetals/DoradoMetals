-- The order's spots as VERBATIM TABLE ROWS (ruling 12): every column of
-- orders.spots, nothing joined on. The metal arrives as its id; a client
-- wanting its name maps against the spots reference read - display
-- composition is the frontend's, shape is the table's.
--
-- The metals join exists ONLY to order the answer stably by metal name, the
-- order every spots read has always used; it contributes no column.
SELECT sp.id, sp.metal_id, sp.order_id, sp.ask, sp.bid,
       sp.scrap_percentage, sp.bullion_percentage, sp.created_at, sp.updated_at
  FROM orders.spots sp
  JOIN metals.metals m ON m.id = sp.metal_id
 WHERE sp.order_id = $1
 ORDER BY m.name ASC, sp.id ASC
