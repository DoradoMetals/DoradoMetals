-- The balance is a sum, never a column somebody keeps correct. `balance` is
-- what has ever been credited in, `locked` is what has ever been drawn out
-- by a lock, and `available` nets them - the same figure `troy_oz` already
-- carries (a lock stores its troy_oz negative), kept alongside for callers
-- that want the gross credited and drawn figures too. It may be negative:
-- metal taken before it settled is a real state, so it is reported.
--
-- `basis` is the pool's own weighted-average credit spot right now, over
-- every credit that carries one. `realised_gain` sums each lock's own
-- snapshotted basis_spot against its lock_price (ruling 123) - the gain is
-- fixed the moment metal leaves and never moves after. `unrealised_gain`
-- values what is still in the pool at today's live spot against that same
-- basis, and is NULL wherever basis is - a pool with no priced credit yet
-- has nothing to compare against.
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
             ORDER BY lk.occurred_at DESC, lk.id DESC LIMIT 1),
         'basis', agg.basis,
         'realised_gain', agg.realised_gain,
         'unrealised_gain', CASE WHEN agg.basis IS NULL THEN NULL
                                  ELSE (agg.balance - agg.locked)
                                       * (COALESCE(sp.bid, sp.ask) - agg.basis) END) AS row
  FROM (
    SELECT p.refiner_id, p.metal_id, sum(p.troy_oz) AS troy_oz,
           COALESCE(sum(p.troy_oz) FILTER (WHERE p.entry = 'credit'), 0) AS balance,
           COALESCE(sum(abs(p.troy_oz)) FILTER (WHERE p.entry = 'lock'), 0) AS locked,
           sum(p.troy_oz * p.spot) FILTER (WHERE p.entry = 'credit' AND p.spot IS NOT NULL)
             / NULLIF(sum(p.troy_oz) FILTER (WHERE p.entry = 'credit' AND p.spot IS NOT NULL), 0)
             AS basis,
           COALESCE(sum(abs(p.troy_oz) * (p.lock_price - p.basis_spot))
             FILTER (WHERE p.entry = 'lock' AND p.basis_spot IS NOT NULL), 0) AS realised_gain
      FROM inventory.pool p
     WHERE ($1::uuid IS NULL OR p.refiner_id = $1::uuid)
       AND ($2::text IS NULL OR p.metal_id = $2::text)
     GROUP BY p.refiner_id, p.metal_id
  ) agg
  LEFT JOIN spots.spots sp ON sp.metal_id = agg.metal_id
 ORDER BY agg.refiner_id, agg.metal_id
