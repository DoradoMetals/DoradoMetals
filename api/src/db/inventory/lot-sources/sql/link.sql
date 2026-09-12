INSERT INTO inventory.lot_sources (lot_id, source_lot_id, kind)
VALUES ($1::uuid, $2::uuid, $3::inventory.lot_source_kind)
RETURNING id, lot_id, source_lot_id, kind,
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
          to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
          created_by_id, updated_by_id
