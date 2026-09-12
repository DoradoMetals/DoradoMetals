CASE
  WHEN EXISTS (SELECT 1 FROM inventory.lot_sources s
                WHERE s.source_lot_id = li.id AND s.kind IN ('split', 'combine'))
    THEN 'consumed'
  WHEN EXISTS (SELECT 1 FROM inventory.lot_sources s
                WHERE s.source_lot_id = li.id AND s.kind = 'sale')
    OR EXISTS (SELECT 1 FROM orders.lots ol
                JOIN orders.orders o ON o.id = ol.order_id
               WHERE ol.lot_id = li.id AND o.direction = 'sale')
    THEN 'sold'
  WHEN EXISTS (SELECT 1 FROM inventory.lot_sources s
                JOIN refining.lots rl ON rl.lot_id = s.lot_id
                JOIN refining.orders ro ON ro.id = rl.refining_order_id
               WHERE s.source_lot_id = li.id AND s.kind = 'batch'
                 AND ro.settled_at IS NOT NULL)
    OR EXISTS (SELECT 1 FROM refining.lots rl
                JOIN refining.orders ro ON ro.id = rl.refining_order_id
               WHERE rl.lot_id = li.id AND ro.settled_at IS NOT NULL)
    THEN 'pooled'
  WHEN EXISTS (SELECT 1 FROM inventory.lot_sources s
                JOIN refining.lots rl ON rl.lot_id = s.lot_id
                JOIN refining.orders ro ON ro.id = rl.refining_order_id
               WHERE s.source_lot_id = li.id AND s.kind = 'batch'
                 AND ro.sent_at IS NOT NULL
                 AND ro.settled_at IS NULL
                 AND ro.cancelled_at IS NULL)
    OR EXISTS (SELECT 1 FROM refining.lots rl
                JOIN refining.orders ro ON ro.id = rl.refining_order_id
               WHERE rl.lot_id = li.id
                 AND ro.sent_at IS NOT NULL
                 AND ro.settled_at IS NULL
                 AND ro.cancelled_at IS NULL)
    THEN 'at refiner'
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
