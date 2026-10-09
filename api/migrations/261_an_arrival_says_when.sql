-- AN ARRIVAL SAYS WHEN IT ARRIVED.
--
-- `fulfillments.arrivals` (185) answers "has it arrived?" as a boolean, and
-- ruling 117 made that view the one definition. The Order Card's footer draws
-- `Received Sep 2`, which is the same fact with its timestamp kept, so the
-- timestamp belongs in the same view rather than in a second expression that
-- could disagree with `arrived`.
--
-- It is the parcel's own `delivered_at` for a SHIPMENT and the fulfillment's
-- `updated_at` for the other three kinds - a drop-off, a pickup and an
-- appointment record their arrival by reaching their done status, and when
-- that happened is when the row last changed. NULL wherever `arrived` is
-- false, so the two columns can never say different things.
--
-- No column is added anywhere; one view gains one column. `exchange` is
-- neither read nor written.

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
        END) AS arrived,
       (CASE
          WHEN m.category = 'SHIPMENT'
            THEN (SELECT max(s.delivered_at)
                    FROM fulfillments.shipments fs
                    JOIN shipping.shipments s ON s.id = fs.shipment_id
                   WHERE fs.fulfillment_id = f.id
                     AND s.direction = 'Inbound'
                     AND (s.delivered_at IS NOT NULL
                          OR s.shipping_status = 'Delivered'))
          WHEN f.status IN ('PICKED_UP', 'COMPLETED', 'DROPPED_OFF') THEN f.updated_at
        END) AS arrived_at
  FROM fulfillments.fulfillments f
  JOIN fulfillments.methods m ON m.id = f.method_id;
