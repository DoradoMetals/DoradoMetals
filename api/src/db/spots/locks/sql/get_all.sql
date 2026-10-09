-- Every lock EVENT, not every currently-locked order (audit row 18): an
-- unlocked order has to appear, and it never could while this read was
-- `WHERE o.spots_locked = true`.
--
-- `state` is the order's own lock vocabulary and no new status word (audit row
-- 21, section 3 answer 8): Finalized is locked with a total, which is what
-- orders/rules.ts isFinalized already means.
SELECT ev.id,
       ev.order_id,
       /*__order_reference__*/ AS reference,
       ev.metal_id,
       ev.bid,
       ev.ask,
       ev.action,
       o.direction,
       ev.created_at AS occurred_at,
       ev.created_by_id AS actor_id,
       ev.created_by AS actor_name,
       CASE WHEN NOT COALESCE(o.spots_locked, false) THEN 'Unlocked'
            WHEN tx.total IS NOT NULL THEN 'Finalized'
            ELSE 'Locked' END AS state
  FROM orders.spot_locks ev
  JOIN orders.orders o ON o.id = ev.order_id
  LEFT JOIN LATERAL (SELECT t.total
                       FROM orders.transactions t
                      WHERE t.order_id = o.id
                      ORDER BY t.created_at DESC NULLS LAST
                      LIMIT 1) tx ON TRUE
 ORDER BY ev.created_at DESC, ev.id ASC, ev.metal_id ASC
