-- Fill the columns 035 added to orders.spots.
--
-- refiners.spots is left alone: the refiners feature has not been migrated and
-- its table is empty, so there is nothing to update. It will be populated by
-- that feature's own backfill, with these columns already in place.
--
-- Conditional, so re-running changes nothing, and guarded like the others.
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

UPDATE orders.spots sp
SET scrap_percentage = m.scrap_percentage,
    bullion_percentage = m.bullion_percentage,
    created_at = m.created_at AT TIME ZONE 'UTC',
    updated_at = m.updated_at AT TIME ZONE 'UTC'
FROM exchange.order_metals m
JOIN metals.metals mt ON mt.name = m.type
WHERE sp.order_id = coalesce(m.purchase_order_id, m.sales_order_id)
  AND sp.metal_id = mt.id
  AND (sp.scrap_percentage IS DISTINCT FROM m.scrap_percentage
    OR sp.bullion_percentage IS DISTINCT FROM m.bullion_percentage
    OR sp.created_at IS DISTINCT FROM (m.created_at AT TIME ZONE 'UTC')
    OR sp.updated_at IS DISTINCT FROM (m.updated_at AT TIME ZONE 'UTC'));
