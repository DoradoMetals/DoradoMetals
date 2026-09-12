-- The order's one label, derived. Ruling 112: statuses are decorative, the
-- database stores facts, the label is computed here and the frontend never
-- computes it. Substituted into list.sql, view.sql and the address-book reads
-- through /*__order_state__*/ so no two reads can disagree. `o` is
-- orders.orders.
--
-- Cancelled wins. Then Completed, when every fact of that direction is done.
-- Otherwise the label names the EARLIEST missing fact, so an admin who pays
-- before the refiner settles still sees what is outstanding rather than a rung
-- the order skipped.
CASE
  WHEN o.cancelled_at IS NOT NULL THEN 'Cancelled'
  WHEN o.direction = 'sale' THEN
    CASE
      WHEN EXISTS (SELECT 1 FROM payments.transfers t
                    WHERE t.order_id = o.id AND t.kind = 'charge'
                      AND t.state = 'Received')
        OR EXISTS (SELECT 1 FROM payments.intents i
                    WHERE i.order_id = o.id
                      AND i.status IN ('succeeded', 'processing'))
        OR EXISTS (SELECT 1 FROM orders.transactions tr
                    WHERE tr.order_id = o.id
                      AND COALESCE(tr.post_charges_amount, 0) <= 0)
      THEN
        CASE
          WHEN EXISTS (SELECT 1 FROM fulfillments.fulfillments f
                        WHERE f.order_id = o.id
                          AND f.status IN ('PICKED_UP', 'COMPLETED', 'DROPPED_OFF'))
            OR EXISTS (SELECT 1 FROM fulfillments.fulfillments f
                        JOIN fulfillments.shipments fs ON fs.fulfillment_id = f.id
                        JOIN shipping.shipments s ON s.id = fs.shipment_id
                       WHERE f.order_id = o.id AND s.direction = 'Outbound'
                         AND s.delivered_at IS NOT NULL)
          THEN 'Completed'
          WHEN o.order_sent IS TRUE
            OR EXISTS (SELECT 1 FROM fulfillments.fulfillments f
                        WHERE f.order_id = o.id AND f.status = 'IN_TRANSIT')
            OR EXISTS (SELECT 1 FROM fulfillments.fulfillments f
                        JOIN fulfillments.shipments fs ON fs.fulfillment_id = f.id
                        JOIN shipping.shipments s ON s.id = fs.shipment_id
                       WHERE f.order_id = o.id AND s.direction = 'Outbound'
                         AND (s.shipped_at IS NOT NULL OR s.tracking_number IS NOT NULL))
          THEN 'In Transit'
          ELSE 'Preparing'
        END
      ELSE 'Awaiting Payment'
    END
  ELSE
    CASE
      WHEN NOT /*__fulfillment_arrived__*/
      THEN 'Awaiting Receipt'
      WHEN EXISTS (SELECT 1 FROM orders.lots ol
                     JOIN inventory.lot_sources ls ON ls.source_lot_id = ol.lot_id
                                                   AND ls.kind = 'batch'
                     JOIN refining.lots rl ON rl.lot_id = ls.lot_id
                     JOIN refining.orders ro ON ro.id = rl.refining_order_id
                    WHERE ol.order_id = o.id
                      AND ro.sent_at IS NOT NULL
                      AND ro.settled_at IS NULL
                      AND ro.cancelled_at IS NULL)
      THEN 'At Refiner'
      WHEN NOT (o.spots_locked
                AND EXISTS (SELECT 1 FROM orders.transactions tr
                             WHERE tr.order_id = o.id AND tr.total IS NOT NULL))
      THEN 'Awaiting Payout'
      WHEN NOT (EXISTS (SELECT 1 FROM payments.transfers t
                         WHERE t.order_id = o.id AND t.kind = 'payout'
                           AND t.state IN ('Sent', 'Received'))
                OR EXISTS (SELECT 1 FROM payments.ledger l
                            WHERE l.order_id = o.id AND l.type = 'Credit'))
      THEN 'Ready to Pay'
      ELSE 'Completed'
    END
END
