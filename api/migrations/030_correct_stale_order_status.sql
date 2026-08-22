-- Order 239's status in the new schema is stale.
--
-- exchange.purchase_orders says Received; orders.orders still says In Transit.
-- exchange is the authoritative copy - it is what live traffic writes to - so
-- the order did advance and the January copy simply never saw it. Same shape of
-- drift as migration 025 found on products.updated_at, and the same fix.
--
-- Written as a set-based correction rather than against the one id, so it
-- closes the same drift wherever it is found and is a no-op once there is none.
--
-- Only safe while exchange is authoritative. Once a switch is promoted past
-- dual this would overwrite a status the new schema owns, so it is guarded the
-- same way the backfills are: it only corrects rows whose order still exists in
-- exchange, and it runs before any switch is promoted.
--
-- exchange is untouched.

UPDATE orders.orders o
SET status = p.purchase_order_status
FROM exchange.purchase_orders p
WHERE p.id = o.id
  AND o.direction = 'purchase'
  AND o.status IS DISTINCT FROM p.purchase_order_status;

UPDATE orders.orders o
SET status = s.sales_order_status
FROM exchange.sales_orders s
WHERE s.id = o.id
  AND o.direction = 'sale'
  AND o.status IS DISTINCT FROM s.sales_order_status;
