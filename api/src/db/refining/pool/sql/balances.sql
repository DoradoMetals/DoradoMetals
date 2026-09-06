-- The balance is a sum, never a column somebody keeps correct. It may be
-- negative: metal taken before it settled is a real state, so it is reported.
SELECT jsonb_build_object(
         'refiner_id', p.refiner_id,
         'metal_id', p.metal_id,
         'troy_oz', sum(p.troy_oz),
         'last_lock_price',
           (SELECT lk.lock_price FROM refining.pool lk
             WHERE lk.refiner_id = p.refiner_id
               AND lk.metal_id = p.metal_id
               AND lk.entry = 'lock'
             ORDER BY lk.occurred_at DESC, lk.id DESC LIMIT 1)) AS row
  FROM refining.pool p
 WHERE ($1::uuid IS NULL OR p.refiner_id = $1::uuid)
   AND ($2::text IS NULL OR p.metal_id = $2::text)
 GROUP BY p.refiner_id, p.metal_id
 ORDER BY p.refiner_id, p.metal_id
