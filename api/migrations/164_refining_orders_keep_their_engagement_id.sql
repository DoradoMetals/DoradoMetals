-- 163 was corrected after it had already run on dev, and a migration the runner
-- has recorded never runs again. This file is 163's corrected body, guarded so
-- that it is a no-op on any database where 163 produced the right rows and a
-- catch-up on the one where it did not.
--
-- What was wrong: 163 matched a new refining order back to its engagement by
-- (refiner, direction, created_at, updated_at), and every one of dev's 31
-- engagements carries the SAME pair of timestamps, so 41 lots landed on 2
-- orders instead of 31. Keeping the engagement's id removes the match entirely.

INSERT INTO refining.orders
       (id, direction, refiner_id, sent_at, fee, created_at, updated_at)
SELECT ro.id,
       CASE o.direction WHEN 'purchase' THEN 'sell'::refining.direction
                        ELSE 'buy'::refining.direction END,
       ro.refiner_id,
       ro.updated_at,
       ro.fee,
       ro.created_at,
       ro.updated_at
  FROM refiners.orders ro
  JOIN orders.orders o ON o.id = ro.order_id
 WHERE ro.refiner_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM refining.orders r WHERE r.id = ro.id);

INSERT INTO refining.lots
       (refining_order_id, lot_id, unit, pre_melt, post_melt, purity, premium,
        created_at, updated_at)
SELECT ri.refiner_order_id,
       ri.order_item_id,
       COALESCE(ri.unit, 't oz'),
       ri.pre_melt,
       ri.post_melt,
       ri.purity,
       ri.premium,
       ro.created_at,
       ro.updated_at
  FROM refiners.items ri
  JOIN refining.orders ro ON ro.id = ri.refiner_order_id
  JOIN lots.items li ON li.id = ri.order_item_id
 WHERE NOT EXISTS (SELECT 1 FROM refining.lots rl WHERE rl.lot_id = ri.order_item_id);
