-- ONE FROZEN QUOTE PER METAL THE ORDER CONTAINS, taken straight from the live
-- feed (ruling 66): the metals are the order's own lines' and the prices are
-- spots.spots', so the statement copies rather than a function building rows.
--
-- A metal with no live quote simply does not join, which is a SHORT insert -
-- the caller compares what came back against the metals it asked for and
-- refuses, because a null spot prices that metal at zero.
--
-- ON CONFLICT (order_id, metal_id) because that pair is UNIQUE
-- (order_spots_one_per_order_metal): freezing twice for one order does
-- nothing rather than raising.
INSERT INTO orders.spots (id, order_id, metal_id, ask, bid)
SELECT gen_random_uuid(), $1, m.metal_id, s.ask, s.bid
  FROM (SELECT DISTINCT metal_id FROM orders.items WHERE order_id = $1) m
  JOIN spots.spots s ON s.metal_id = m.metal_id
ON CONFLICT (order_id, metal_id) DO NOTHING
RETURNING id, order_id, metal_id, ask, bid
