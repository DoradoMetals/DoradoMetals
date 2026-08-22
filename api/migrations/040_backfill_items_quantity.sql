-- Restore the nulls 031 had to coalesce away.
--
-- Four purchase order items have no quantity in exchange. Until 039 the column
-- would not hold that, so the backfill wrote 1. Now it can, so they are put
-- back to what exchange says.
--
-- Guarded and conditional like the other backfills. exchange is only ever read.

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

UPDATE orders.items i
SET quantity = poi.quantity
FROM exchange.purchase_order_items poi
WHERE poi.id = i.id
  AND i.quantity IS DISTINCT FROM poi.quantity;
