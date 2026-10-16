-- The order's lock log, newest first: every lock and unlock per metal, with
-- the figures in force, who did it (created_by_id, ruling 127) and, for a
-- metal discovered after the order locked, why.
SELECT sl.id, sl.order_id, sl.metal_id, sl.action, sl.bid, sl.ask, sl.reason,
       sl.created_at, sl.created_by_id
  FROM orders.spot_locks sl
 WHERE sl.order_id = $1
 ORDER BY sl.created_at DESC, sl.id DESC
