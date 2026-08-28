-- Which refinery has each sales order's metal, seeded onto the ENGAGEMENT.
--
-- exchange.sales_orders.supplier_id used to reach the new schema through
-- 031's INSERT into orders.orders.refinery_id, and 093's engagement seed
-- copied it onward from there. 094 dropped the column, so on a database built
-- from nothing that relay no longer exists - 093's fallback derives a
-- refiner only from refiners.items, which exchange populates for purchase
-- flow assays, not for the sales-side supplier linkage. This is the direct
-- seed: exchange.sales_orders.supplier_id -> refiners.orders.refiner_id,
-- validated against refiners.refiners exactly the way the old mirror
-- validated it.
--
-- Idempotent, NULL-engagements only (the engagement is authoritative; a value
-- it already holds is never overwritten by the shadow), exchange only read.
-- On dev this is a no-op: 093 ran while the column still existed and seeded
-- every value. It earns its place on the fresh-build path, where
-- verify:backfill caught its absence the same session 094 landed.
UPDATE refiners.orders ro
   SET refiner_id = s.supplier_id, updated_at = now()
  FROM exchange.sales_orders s
 WHERE s.id = ro.order_id
   AND s.supplier_id IS NOT NULL
   AND ro.refiner_id IS NULL
   AND EXISTS (SELECT 1 FROM refiners.refiners r WHERE r.id = s.supplier_id);
