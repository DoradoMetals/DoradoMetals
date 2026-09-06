-- Fulfillments, derived from shipments.
--
-- A fulfillment is how an order was handed over: the customer dropped it at a
-- carrier counter, or we shipped it to them. exchange records that as
-- shipments.pickup_type, and the new schema makes it a row of its own so that
-- an order fulfilled without a shipment - a walk-in, an appointment - has
-- somewhere to live. fulfillments.methods lists eleven such ways; only two are
-- reachable from exchange, because only two are recorded there.
--
-- This is also what carries the order link. shipping.shipments has no
-- purchase_order_id or sales_order_id; fulfillments.fulfillments.order_id does,
-- one row per order. That is why fulfillments has to be backfilled before the
-- shipping repo can be split: all three shipment reads are SELECT *, so the
-- wire shape includes both order id columns, and nothing else in the new schema
-- can supply them.
--
-- The mapping, all of it verified against production:
--
--   pickup_type 'Store Dropoff' -> CARRIER DROPOFF   (61 of 70, all Inbound)
--   pickup_type 'DropShip'      -> DROPSHIP          (9 of 70, all Outbound)
--
-- Those are the only two values production holds, and each corresponds exactly
-- to a direction. The method is looked up by (type, direction) because
-- fulfillments.methods lists each type once per direction.
--
--   shipping_status 'Delivered' -> COMPLETED, anything else -> PENDING
--
-- which is what the sixteen rows January created already say.
--
-- The locations are resolved by TYPE rather than by name: an inbound parcel is
-- received at the FEDEX_OFFICE location, an outbound one ships from the
-- REFINER_OFFICE. Dev's sixteen rows agree without exception. Resolving by type
-- means renaming a location does not break the mapping.
--
-- Idempotent and guarded. exchange is only ever read.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM fulfillments.fulfillments f
    WHERE NOT EXISTS (SELECT 1 FROM orders.orders o WHERE o.id = f.order_id)
  ) THEN
    RAISE EXCEPTION
      'refusing to backfill: fulfillments references an order the orders schema does not have.';
  END IF;
END $$;

-- One fulfillment per order, which fulfillments_order_uniq enforces.

INSERT INTO fulfillments.fulfillments (
  order_id, method_id, status, created_by, updated_by, created_at, updated_at
)
SELECT DISTINCT ON (coalesce(e.purchase_order_id, e.sales_order_id))
  coalesce(e.purchase_order_id, e.sales_order_id),
  m.id,
  (CASE WHEN e.shipping_status = 'Delivered' THEN 'COMPLETED' ELSE 'PENDING' END)
    ::fulfillments.fulfillment_status,
  NULL, NULL,
  e.created_at, e.created_at
FROM exchange.shipments e
JOIN fulfillments.methods m
  ON m.type = CASE e.pickup_type
                WHEN 'Store Dropoff' THEN 'CARRIER DROPOFF'
                WHEN 'DropShip'      THEN 'DROPSHIP'
              END
 AND m.direction = (CASE WHEN e.purchase_order_id IS NOT NULL THEN 'purchase' ELSE 'sale' END)::orders.direction
WHERE coalesce(e.purchase_order_id, e.sales_order_id) IS NOT NULL
  AND EXISTS (SELECT 1 FROM orders.orders o WHERE o.id = coalesce(e.purchase_order_id, e.sales_order_id))
ORDER BY coalesce(e.purchase_order_id, e.sales_order_id), e.created_at
ON CONFLICT (order_id) DO NOTHING;

-- The link, and the location that handled it.

INSERT INTO fulfillments.shipments (
  fulfillment_id, shipment_id, recipient_location_id, shipper_location_id
)
SELECT
  f.id,
  e.id,
  CASE WHEN e.type = 'Inbound'
       THEN (SELECT l.id FROM places.locations l WHERE l.type = 'FEDEX_OFFICE' LIMIT 1) END,
  CASE WHEN e.type = 'Outbound'
       THEN (SELECT l.id FROM places.locations l WHERE l.type = 'REFINER_OFFICE' LIMIT 1) END
FROM exchange.shipments e
JOIN fulfillments.fulfillments f
  ON f.order_id = coalesce(e.purchase_order_id, e.sales_order_id)
WHERE EXISTS (SELECT 1 FROM shipping.shipments s WHERE s.id = e.id)
ON CONFLICT (shipment_id) DO UPDATE SET
  fulfillment_id = EXCLUDED.fulfillment_id,
  recipient_location_id = coalesce(EXCLUDED.recipient_location_id, fulfillments.shipments.recipient_location_id),
  shipper_location_id = coalesce(EXCLUDED.shipper_location_id, fulfillments.shipments.shipper_location_id);
