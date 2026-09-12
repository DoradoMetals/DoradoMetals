SELECT o.id AS order_id,
       /*__order_reference__*/ AS reference,
       sp.metal_id,
       sp.bid,
       sp.ask,
       o.updated_at AS locked_at,
       o.updated_by AS locked_by
  FROM orders.orders o
  JOIN orders.spots sp ON sp.order_id = o.id
 WHERE o.spots_locked = true
 ORDER BY o.updated_at DESC, o.id ASC, sp.metal_id ASC
