SELECT id, bullion_id, metal_id, unit, quantity, pre_melt, post_melt, purity,
       content_snapshot, content, image_id, split_from_id,
       to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
       created_by_id, updated_by_id
  FROM lots.items
 WHERE id = $1
