SELECT sp.id, sp.order_id, sp.metal_id, sp.ask, sp.bid
  FROM refiners.spots sp
 WHERE sp.order_id = $1
 ORDER BY sp.metal_id ASC, sp.id ASC
