CASE
  WHEN EXISTS (SELECT 1 FROM inventory.lot_sources s
                WHERE s.source_lot_id = li.id AND s.kind IN ('split', 'combine'))
    THEN 'consumed'
  WHEN EXISTS (SELECT 1 FROM inventory.lot_sources s
                WHERE s.source_lot_id = li.id AND s.kind = 'sale'
                  AND NOT (EXISTS (SELECT 1 FROM orders.lot_unlinks u WHERE u.lot_id = s.lot_id)
                           AND NOT EXISTS (SELECT 1 FROM orders.lots sl WHERE sl.lot_id = s.lot_id))
                  AND NOT EXISTS (SELECT 1 FROM orders.lots cl
                                   JOIN orders.orders co ON co.id = cl.order_id
                                  WHERE cl.lot_id = s.lot_id AND co.cancelled_at IS NOT NULL))
    OR EXISTS (SELECT 1 FROM orders.lots ol
                JOIN orders.orders o ON o.id = ol.order_id
               WHERE ol.lot_id = li.id AND o.direction = 'sale')
    THEN 'sold'
  WHEN EXISTS (SELECT 1 FROM inventory.lot_sources s
                JOIN refining.lots rl ON rl.lot_id = s.lot_id
                JOIN refining.orders ro ON ro.id = rl.refining_order_id
                                    AND rl.released_at IS NULL
               WHERE s.source_lot_id = li.id AND s.kind = 'batch'
                 AND ro.settled_at IS NOT NULL)
    OR EXISTS (SELECT 1 FROM refining.lots rl
                JOIN refining.orders ro ON ro.id = rl.refining_order_id
                                    AND rl.released_at IS NULL
               WHERE rl.lot_id = li.id AND ro.settled_at IS NOT NULL)
    THEN 'pooled'
  WHEN EXISTS (SELECT 1 FROM inventory.lot_sources s
                JOIN refining.lots rl ON rl.lot_id = s.lot_id
                JOIN refining.orders ro ON ro.id = rl.refining_order_id
                                    AND rl.released_at IS NULL
               WHERE s.source_lot_id = li.id AND s.kind = 'batch'
                 AND ro.sent_at IS NOT NULL
                 AND ro.settled_at IS NULL
                 AND ro.cancelled_at IS NULL)
    OR EXISTS (SELECT 1 FROM refining.lots rl
                JOIN refining.orders ro ON ro.id = rl.refining_order_id
                                    AND rl.released_at IS NULL
               WHERE rl.lot_id = li.id
                 AND ro.sent_at IS NOT NULL
                 AND ro.settled_at IS NULL
                 AND ro.cancelled_at IS NULL)
    THEN 'at refiner'
  WHEN EXISTS (SELECT 1 FROM inventory.lot_sources s
                JOIN refining.lots rl ON rl.lot_id = s.lot_id
                JOIN refining.orders ro ON ro.id = rl.refining_order_id
               WHERE s.source_lot_id = li.id AND s.kind = 'batch'
                 AND rl.released_at IS NOT NULL AND rl.returned_at IS NULL
                 AND ro.cancelled_at IS NOT NULL
                 AND EXISTS (SELECT 1
                               FROM fulfillments.fulfillments f
                               LEFT JOIN fulfillments.shipments fs ON fs.fulfillment_id = f.id
                               LEFT JOIN shipping.shipments sh ON sh.id = fs.shipment_id
                                                              AND sh.direction <> 'Return'
                              WHERE f.refining_order_id = ro.id
                                AND (f.status IN ('PICKED_UP', 'COMPLETED', 'DROPPED_OFF')
                                     OR sh.delivered_at IS NOT NULL
                                     OR sh.shipping_status = 'Delivered')))
    OR EXISTS (SELECT 1 FROM refining.lots rl
                JOIN refining.orders ro ON ro.id = rl.refining_order_id
               WHERE rl.lot_id = li.id
                 AND rl.released_at IS NOT NULL AND rl.returned_at IS NULL
                 AND ro.cancelled_at IS NOT NULL
                 AND EXISTS (SELECT 1
                               FROM fulfillments.fulfillments f
                               LEFT JOIN fulfillments.shipments fs ON fs.fulfillment_id = f.id
                               LEFT JOIN shipping.shipments sh ON sh.id = fs.shipment_id
                                                              AND sh.direction <> 'Return'
                              WHERE f.refining_order_id = ro.id
                                AND (f.status IN ('PICKED_UP', 'COMPLETED', 'DROPPED_OFF')
                                     OR sh.delivered_at IS NOT NULL
                                     OR sh.shipping_status = 'Delivered')))
    THEN 'at refiner'
  WHEN NOT EXISTS (SELECT 1 FROM orders.lots ol WHERE ol.lot_id = li.id)
   AND EXISTS (SELECT 1 FROM orders.lot_unlinks u WHERE u.lot_id = li.id)
    THEN 'removed'
  WHEN NOT EXISTS (SELECT 1 FROM orders.lots ol WHERE ol.lot_id = li.id)
    THEN 'on hand'
  WHEN EXISTS (SELECT 1 FROM orders.lots ol
                JOIN orders.orders o ON o.id = ol.order_id
               WHERE ol.lot_id = li.id
                 AND o.direction = 'purchase'
                 AND /*__fulfillment_arrived__*/)
    THEN 'on hand'
  ELSE 'incoming'
END
