-- One quote per metal the order actually contains, frozen at placement.
-- exchange writes a row per metal whether or not the order has any of it; this
-- writes one per metal on the order, because a spot for a metal nobody sold is
-- a row that means nothing. ON CONFLICT for the same reason create.sql carries
-- it: orders.spots is multi-writer and a re-run must not raise.
-- created_at and updated_at are not listed: public.audit_stamp stamps both
-- (migration 116), and orders.spots declares no default for either.
INSERT INTO orders.spots (order_id, metal_id, ask, bid)
SELECT DISTINCT $1::uuid, oi.metal_id, s.ask, s.bid
  FROM orders.items oi
  LEFT JOIN spots.spots s ON s.metal_id = oi.metal_id
 WHERE oi.order_id = $1::uuid
ON CONFLICT (order_id, metal_id) DO NOTHING
