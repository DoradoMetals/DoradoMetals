-- This lot's own source edges - what it was split from, combined from, or
-- batched/sold from. lot_id is always the derived side, so this is the
-- "sources" half of the lineage for one lot.
SELECT id, lot_id, source_lot_id, kind,
       to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
       created_by_id, updated_by_id
  FROM inventory.lot_sources
 WHERE lot_id = $1
 ORDER BY created_at ASC, id ASC
