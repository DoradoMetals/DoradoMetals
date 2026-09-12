-- The edges where these lots are the SOURCE - what each one became (its
-- split, combine, batch or sale child). Batched so a guard that must check
-- several lots' refiner lot at once - a customer-side combine of lots
-- already at the same refiner - does it in one round trip.
SELECT id, lot_id, source_lot_id, kind,
       to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
       created_by_id, updated_by_id
  FROM inventory.lot_sources
 WHERE source_lot_id = ANY($1::uuid[])
 ORDER BY created_at ASC, id ASC
