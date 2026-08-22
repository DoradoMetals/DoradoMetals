-- Fill shipping_service from the sales order it belongs to.
--
-- Conditional and guarded like the other backfills. exchange is only ever read.

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

UPDATE orders.transactions t
SET shipping_service = s.shipping_service
FROM exchange.sales_orders s
WHERE s.id = t.order_id
  AND t.shipping_service IS DISTINCT FROM s.shipping_service;
