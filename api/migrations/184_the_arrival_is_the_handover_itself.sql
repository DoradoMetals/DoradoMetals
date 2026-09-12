-- Jacob, 2026-09-12: there is no "mark received" action and no `received_at`
-- column. ARRIVAL IS THE INBOUND FULFILLMENT REACHING ITS DONE STATE, which
-- already exists per kind:
--
--   SHIPMENT   the inbound parcel's shipping_status = 'Delivered'
--   PICKUP     fulfillments.status = 'PICKED_UP'
--   DIRECT     fulfillments.status = 'COMPLETED'
--   DROPOFF    fulfillments.status = 'DROPPED_OFF'
--
-- A second column saying the same thing is a second place to keep correct, and
-- the lot's `on hand` position and the order's `Awaiting Receipt` label both
-- read the done state directly now
-- (`api/src/db/fulfillments/sql/arrived.sql`, one expression substituted into
-- both reads so they cannot disagree).
--
-- 177 added `received_at` earlier in this same lane and is DELETED rather than
-- left as a file that creates a column nothing reads. This drops the column from
-- the databases that already ran it - dev, the lane's test database and the
-- production-shaped copy. It has never been read by any released code and it
-- carries nothing 183's derivation below does not re-derive.
--
-- Then the arrival itself is backfilled, for the same reason 183 backfills the
-- payout: `exchange.purchase_orders.purchase_order_status` is the only evidence
-- the business has that a legacy parcel arrived, and without it every completed
-- legacy purchase order derives `Awaiting Receipt` forever. Read, never written.
--
-- Idempotent: every statement is guarded on the fact being absent.

DROP INDEX IF EXISTS fulfillments.fulfillments_received_at_idx;

ALTER TABLE fulfillments.fulfillments DROP COLUMN IF EXISTS received_at;

UPDATE shipping.shipments s
   SET delivered_at = COALESCE(s.delivered_at, o.updated_at, o.created_at, now()),
       shipping_status = 'Delivered'
  FROM fulfillments.shipments fs
  JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
  JOIN orders.orders o ON o.id = f.order_id
  JOIN exchange.purchase_orders p ON p.id = o.id
 WHERE fs.shipment_id = s.id
   AND s.direction = 'Inbound'
   AND s.delivered_at IS NULL
   AND o.direction = 'purchase'
   AND p.purchase_order_status IN ('Received', 'Payment Processing', 'Completed');

UPDATE fulfillments.fulfillments f
   SET status = CASE m.category
                  WHEN 'PICKUP' THEN 'PICKED_UP'
                  WHEN 'DROPOFF' THEN 'DROPPED_OFF'
                  ELSE 'COMPLETED'
                END::fulfillments.fulfillment_status
  FROM fulfillments.methods m,
       orders.orders o,
       exchange.purchase_orders p
 WHERE m.id = f.method_id
   AND o.id = f.order_id
   AND p.id = o.id
   AND m.category <> 'SHIPMENT'
   AND o.direction = 'purchase'
   AND f.status NOT IN ('PICKED_UP', 'COMPLETED', 'DROPPED_OFF')
   AND p.purchase_order_status IN ('Received', 'Payment Processing', 'Completed');

DO $$
DECLARE
  inbound bigint;
  arrived bigint;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE
           (m.category = 'SHIPMENT'
            AND EXISTS (SELECT 1 FROM fulfillments.shipments fs
                          JOIN shipping.shipments s ON s.id = fs.shipment_id
                         WHERE fs.fulfillment_id = f.id AND s.direction = 'Inbound'
                           AND (s.delivered_at IS NOT NULL OR s.shipping_status = 'Delivered')))
           OR (m.category <> 'SHIPMENT'
               AND f.status IN ('PICKED_UP', 'COMPLETED', 'DROPPED_OFF')))
    INTO inbound, arrived
    FROM fulfillments.fulfillments f
    JOIN fulfillments.methods m ON m.id = f.method_id
    JOIN orders.orders o ON o.id = f.order_id
   WHERE o.direction = 'purchase';

  RAISE NOTICE 'fulfillments: % of % inbound handover(s) have reached their done state', arrived, inbound;
END $$;
