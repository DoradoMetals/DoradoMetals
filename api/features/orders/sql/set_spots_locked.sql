-- Whether an order's quoted spots are pinned.
--
-- NOT set_flag.sql, and the difference is the whole reason this file exists.
-- That statement writes `true` and only `true`, because the three flags it
-- serves (order_sent, tracking_updated, review_created) are one-way latches -
-- an order that has been sent stays sent. `spots_locked` is not a latch: the
-- pricing path locks it and the cancel path unlocks it, so the value is a
-- PARAMETER rather than a literal.
--
-- exchange's toggleSpots was `UPDATE exchange.purchase_orders SET spots_locked
-- = $1 WHERE id = $2`, with no updated_at touch. This one touches it, matching
-- every other write in this schema; the mirror it replaces took updated_at
-- from exchange's own row, so the column moved either way.
--
-- Direction-blind on purpose. orders.orders is one table and a sales order
-- has spots too; the caller decides which order it means by handing over an
-- id, exactly as set_status.sql does.
UPDATE orders.orders
   SET spots_locked = $1, updated_at = now()
 WHERE id = $2
RETURNING id, spots_locked
