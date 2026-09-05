INSERT INTO orders.spots (id, order_id, metal_id, ask, bid)
SELECT gen_random_uuid(), $1, m.metal_id, s.ask, s.bid
  FROM (SELECT DISTINCT metal_id FROM orders.items WHERE order_id = $1) m
  JOIN spots.spots s ON s.metal_id = m.metal_id
ON CONFLICT (order_id, metal_id) DO NOTHING
RETURNING id, order_id, metal_id, ask, bid
