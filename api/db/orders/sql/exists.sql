-- Whether an order is in the new schema at all.
--
-- Asked before creating a fulfillment for it. orders.orders is populated by
-- backfill and kept current by the orders dual-write, so an order that exists
-- only in exchange has no row here - and the foreign key violation that would
-- otherwise surface says nothing about what to do next.
SELECT EXISTS (SELECT 1 FROM orders.orders WHERE id = $1) AS present
