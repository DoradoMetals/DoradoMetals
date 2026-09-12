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

-- EDITED 2026-09-12 (ruling 112, facts lane). `orders.orders.status` is gone -
-- 180 carried its one load-bearing value onto `cancelled_at` and 181 dropped the
-- column - so the drift this file closes is now the drift in that fact. Edited
-- rather than left, for the same reason 031 was: this file is part of the
-- build-from-nothing path, and a migration naming a dropped column breaks it.

UPDATE orders.orders o
SET cancelled_at = COALESCE(o.cancelled_at, p.updated_at AT TIME ZONE 'UTC', now())
FROM exchange.purchase_orders p
WHERE p.id = o.id
  AND o.direction = 'purchase'
  AND p.purchase_order_status = 'Cancelled'
  AND o.cancelled_at IS NULL;

UPDATE orders.orders o
SET cancelled_at = COALESCE(o.cancelled_at, s.updated_at AT TIME ZONE 'UTC', now())
FROM exchange.sales_orders s
WHERE s.id = o.id
  AND o.direction = 'sale'
  AND s.sales_order_status = 'Cancelled'
  AND o.cancelled_at IS NULL;
