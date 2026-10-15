-- A PLACED SALE HOLDS ITS SPOTS LOCKED.
--
-- Orders port review section 1 item 1 (docs/design/orders-port-review). Sale
-- placement froze orders.spots but never set orders.orders.spots_locked and
-- recorded no orders.spot_locks event, so every read priced a sale's lines at
-- the live ask while Totals showed the amounts stored at placement. place.ts
-- now locks a sale the way it locks a purchase; this gives every sale placed
-- before that the same two facts.
--
-- THE EVENT IS THE OPENING LOCK, copied from the sale's own frozen
-- orders.spots rows (ruling 66: one row per frozen metal), dated at placement
-- (the order's created_at) and attributed to whoever placed it. Nothing is
-- re-read from the feed: the frozen pair is what the customer was charged on.
--
-- GUARDED BY NOT EXISTS on any lock event for the order, and the flag is set
-- only on a sale that is placed, not cancelled and not yet locked, so a re-run
-- adds nothing. A sale with no frozen rows is left alone.
--
-- Verified before writing on dev (2026-10-14): 10 sales, all uncancelled and
-- unlocked, each with frozen rows; 40 frozen rows become 40 lock events.
--
-- Purely additive: rows appended to orders.spot_locks and one flag set on
-- orders.orders. `exchange` is neither read nor written.

INSERT INTO orders.spot_locks (order_id, metal_id, action, bid, ask,
                               created_at, updated_at, created_by_id)
SELECT os.order_id, os.metal_id, 'lock', os.bid, os.ask,
       COALESCE(o.created_at, now()), COALESCE(o.created_at, now()), o.created_by_id
  FROM orders.spots os
  JOIN orders.orders o ON o.id = os.order_id
 WHERE o.direction = 'sale'
   AND o.cancelled_at IS NULL
   AND o.spots_locked IS NOT TRUE
   AND NOT EXISTS (SELECT 1 FROM orders.spot_locks el WHERE el.order_id = o.id);

UPDATE orders.orders o
   SET spots_locked = true
 WHERE o.direction = 'sale'
   AND o.cancelled_at IS NULL
   AND o.spots_locked IS NOT TRUE
   AND EXISTS (SELECT 1 FROM orders.spots os WHERE os.order_id = o.id);

DO $$
DECLARE
  locked_sales int;
  unlocked_sales int;
BEGIN
  SELECT count(*) FILTER (WHERE spots_locked IS TRUE),
         count(*) FILTER (WHERE spots_locked IS NOT TRUE)
    INTO locked_sales, unlocked_sales
    FROM orders.orders
   WHERE direction = 'sale' AND cancelled_at IS NULL;
  RAISE NOTICE '% placed sale(s) locked, % still unlocked', locked_sales, unlocked_sales;
END $$;
