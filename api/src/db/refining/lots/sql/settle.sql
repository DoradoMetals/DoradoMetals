-- Settlement writes every lot's assay and stamps it settled, in ONE statement:
-- the refiner reports a whole order at once and a per-lot loop would leave a
-- half-settled order behind if it stopped in the middle. A lot the statement
-- does not name keeps the assay it already has.
UPDATE refining.lots rl
   SET pre_melt = COALESCE(a.pre_melt, rl.pre_melt),
       post_melt = COALESCE(a.post_melt, rl.post_melt),
       purity = COALESCE(a.purity, rl.purity),
       unit = COALESCE(a.unit, rl.unit),
       premium = COALESCE(a.premium, rl.premium),
       settled_at = COALESCE(rl.settled_at, now())
  FROM (
    SELECT * FROM unnest(
      $2::uuid[], $3::numeric[], $4::numeric[], $5::numeric[], $6::text[], $7::numeric[]
    ) AS t(lot_id, pre_melt, post_melt, purity, unit, premium)
  ) a
 WHERE rl.refining_order_id = $1
   AND a.lot_id = rl.lot_id
RETURNING rl.id, rl.refining_order_id, rl.lot_id, rl.unit, rl.pre_melt, rl.post_melt,
          rl.purity, rl.content, rl.premium,
          to_char(rl.settled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS settled_at,
          to_char(rl.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
          to_char(rl.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
          rl.created_by_id, rl.updated_by_id
