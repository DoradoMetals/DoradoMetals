-- The rest of what 062 cannot delete, found by asking instead of by failing.
--
-- 062 removes new-schema rows exchange has no counterpart for. It deletes seven
-- tables' worth, children before parents, and it misses two - so it fails on a
-- foreign key, one table per attempt, each attempt costing a full run.
--
-- Rather than discover them one rollback at a time, every foreign key pointing
-- at orders.orders was enumerated and counted against the residue. Eight tables
-- reference it. On a restored copy of production:
--
--   core.reviews                 0
--   fulfillments.fulfillments    3   <- 062 does not delete this
--   orders.items                 3       062 deletes it
--   orders.spots                12       062 deletes it
--   payments.intents             0       cleared by 061a
--   payments.ledger              0
--   refiners.spots              12   <- 062 does not delete this
--   reviews.reviews              0
--
-- refiners.spots is the one the rehearsal hit. fulfillments.fulfillments was
-- still ahead of it and would have been the next failure - and 062 deletes
-- refiners.ITEMS, which is easy to misread as covering refiners.spots.
--
-- fulfillments has three children of its own - directs, pickups, shipments - so
-- those come first. Same ordering discipline as 062 and 061a.
--
-- WHY NOT FOLD THIS INTO 062. It is applied on dev and migrations are immutable
-- here; the runner checksums them. And a fix has to sort BEFORE the migration it
-- unblocks, because the runner stops at the first failure and never reaches a
-- later file.
--
-- Data-driven rather than naming orders 298, 299 and 303, so it is a no-op
-- wherever there is no residue - dev, and any rebuild where exchange never lost
-- them.
--
-- Destructive only to the new schemas, which are derived and have never been
-- promoted. exchange is only read.

DELETE FROM fulfillments.directs d
USING fulfillments.fulfillments f, orders.orders o
WHERE d.fulfillment_id = f.id AND f.order_id = o.id
  AND NOT EXISTS (SELECT 1 FROM exchange.purchase_orders p WHERE p.id = o.id)
  AND NOT EXISTS (SELECT 1 FROM exchange.sales_orders    s WHERE s.id = o.id);

DELETE FROM fulfillments.pickups k
USING fulfillments.fulfillments f, orders.orders o
WHERE k.fulfillment_id = f.id AND f.order_id = o.id
  AND NOT EXISTS (SELECT 1 FROM exchange.purchase_orders p WHERE p.id = o.id)
  AND NOT EXISTS (SELECT 1 FROM exchange.sales_orders    s WHERE s.id = o.id);

DELETE FROM fulfillments.shipments h
USING fulfillments.fulfillments f, orders.orders o
WHERE h.fulfillment_id = f.id AND f.order_id = o.id
  AND NOT EXISTS (SELECT 1 FROM exchange.purchase_orders p WHERE p.id = o.id)
  AND NOT EXISTS (SELECT 1 FROM exchange.sales_orders    s WHERE s.id = o.id);

DELETE FROM fulfillments.fulfillments f
USING orders.orders o
WHERE f.order_id = o.id
  AND NOT EXISTS (SELECT 1 FROM exchange.purchase_orders p WHERE p.id = o.id)
  AND NOT EXISTS (SELECT 1 FROM exchange.sales_orders    s WHERE s.id = o.id);

DELETE FROM refiners.spots r
USING orders.orders o
WHERE r.order_id = o.id
  AND NOT EXISTS (SELECT 1 FROM exchange.purchase_orders p WHERE p.id = o.id)
  AND NOT EXISTS (SELECT 1 FROM exchange.sales_orders    s WHERE s.id = o.id);
