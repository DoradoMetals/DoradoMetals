-- Fill source_address_id from the order the snapshot was taken for.
--
-- Matched through exchange rather than by comparing address values: the order
-- knows which address it was placed against, and that is the fact being
-- recorded. Comparing line_1 and zip would guess, and two orders to the same
-- house would guess the same way.
--
-- Conditional and guarded like the other backfills.
--
-- exchange is only ever read.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM orders.orders n
    WHERE NOT EXISTS (SELECT 1 FROM exchange.purchase_orders e WHERE e.id = n.id)
      AND NOT EXISTS (SELECT 1 FROM exchange.sales_orders e WHERE e.id = n.id)
  ) THEN
    RAISE EXCEPTION
      'refusing to backfill: orders.orders holds rows exchange does not, so exchange is no longer authoritative.';
  END IF;
END $$;

UPDATE orders.addresses oa
SET source_address_id = src.address_id
FROM (
  SELECT p.id AS order_id, p.address_id FROM exchange.purchase_orders p WHERE p.address_id IS NOT NULL
  UNION ALL
  SELECT s.id, s.address_id FROM exchange.sales_orders s WHERE s.address_id IS NOT NULL
) src
WHERE src.order_id = oa.order_id
  AND oa.source_address_id IS DISTINCT FROM src.address_id;
