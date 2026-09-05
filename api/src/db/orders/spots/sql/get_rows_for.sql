SELECT sp.id, sp.metal_id, sp.order_id, sp.ask, sp.bid,
       sp.scrap_percentage, sp.bullion_percentage, sp.created_at, sp.updated_at
  FROM orders.spots sp
 WHERE sp.order_id = $1
 ORDER BY sp.metal_id ASC, sp.id ASC
