-- Collapses every existing edge of one kind pointing AT this derived lot into
-- a single edge from the new source, in one statement. Used when a
-- customer-side combine merges several batch parents the refiner already
-- holds under one refiner lot: the refiner lot's batch edges are deleted and
-- replaced with one edge from the newly combined lot.
WITH gone AS (
  DELETE FROM inventory.lot_sources
   WHERE lot_id = $1::uuid AND kind = $3::inventory.lot_source_kind
)
INSERT INTO inventory.lot_sources (lot_id, source_lot_id, kind)
VALUES ($1::uuid, $2::uuid, $3::inventory.lot_source_kind)
RETURNING id, lot_id, source_lot_id, kind,
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
          to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
          created_by_id, updated_by_id
