-- The balance is a sum, never a column somebody keeps correct. `balance` is
-- what has ever been credited in, `locked` is what has ever been drawn out
-- by a lock, and `available` nets them - the same figure `troy_oz` already
-- carries (a lock stores its troy_oz negative), kept alongside for callers
-- that want the gross credited and drawn figures too. It may be negative:
-- metal taken before it settled is a real state, so it is reported.
SELECT jsonb_build_object(
         'refiner_id', agg.refiner_id,
         'metal_id', agg.metal_id,
         'troy_oz', agg.troy_oz,
         'balance', agg.balance,
         'locked', agg.locked,
         'available', agg.balance - agg.locked,
         'last_lock_price',
           (SELECT lk.lock_price FROM inventory.pool lk
             WHERE lk.refiner_id = agg.refiner_id
               AND lk.metal_id = agg.metal_id
               AND lk.entry = 'lock'
             ORDER BY lk.occurred_at DESC, lk.id DESC LIMIT 1)) AS row
  FROM (
    SELECT p.refiner_id, p.metal_id, sum(p.troy_oz) AS troy_oz,
           COALESCE(sum(p.troy_oz) FILTER (WHERE p.entry = 'credit'), 0) AS balance,
           COALESCE(sum(abs(p.troy_oz)) FILTER (WHERE p.entry = 'lock'), 0) AS locked
      FROM inventory.pool p
     WHERE ($1::uuid IS NULL OR p.refiner_id = $1::uuid)
       AND ($2::text IS NULL OR p.metal_id = $2::text)
     GROUP BY p.refiner_id, p.metal_id
  ) agg
 ORDER BY agg.refiner_id, agg.metal_id
