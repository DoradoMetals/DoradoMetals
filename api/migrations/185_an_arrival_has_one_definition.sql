-- Three reads ask the same question - has this handover arrived? The order's
-- `Awaiting Receipt` rung, the lot's `on hand` position, and a refiner BUY
-- order's `Awaiting Delivery` rung. The first two hang off an orders.orders row
-- and the third off a refining.orders row, so one substituted SQL fragment
-- cannot serve all three: the correlation differs.
--
-- A view can. `fulfillments.arrivals` is the fulfillment, its two possible
-- owners, and whether it has reached its done state - which is the parcel for a
-- SHIPMENT and the fulfillment's own status for the other three kinds
-- (Jacob, 2026-09-12: arrival is the handover reaching its done state, and
-- there is no column for it).
--
-- Additive: one view, no table touched. `exchange` is neither read nor written.

CREATE OR REPLACE VIEW fulfillments.arrivals AS
SELECT f.id AS fulfillment_id,
       f.order_id,
       f.refining_order_id,
       m.category,
       (CASE
          WHEN m.category = 'SHIPMENT'
            THEN EXISTS (SELECT 1
                           FROM fulfillments.shipments fs
                           JOIN shipping.shipments s ON s.id = fs.shipment_id
                          WHERE fs.fulfillment_id = f.id
                            AND s.direction = 'Inbound'
                            AND (s.delivered_at IS NOT NULL
                                 OR s.shipping_status = 'Delivered'))
          ELSE f.status IN ('PICKED_UP', 'COMPLETED', 'DROPPED_OFF')
        END) AS arrived
  FROM fulfillments.fulfillments f
  JOIN fulfillments.methods m ON m.id = f.method_id;
