-- Whether a CUSTOMER lot is already batched onto a refiner order. `lot_id` on
-- refining.lots is the MINTED refiner lot, never the customer's own id, so
-- this reaches back through the `batch` edge rather than matching lot_id
-- directly.
SELECT rl.id, rl.refining_order_id, rl.lot_id,
       to_char(rl.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       to_char(rl.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
       rl.created_by_id, rl.updated_by_id
  FROM refining.lots rl
  JOIN inventory.lot_sources s ON s.lot_id = rl.lot_id AND s.kind = 'batch'
 WHERE s.source_lot_id = ANY($1::uuid[])
 ORDER BY rl.id ASC
