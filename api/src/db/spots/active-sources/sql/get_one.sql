SELECT a.metal_id, a.source_id,
       a.created_at, a.updated_at, a.created_by, a.updated_by,
       a.created_by_id, a.updated_by_id
  FROM spots.active_sources a
 WHERE a.metal_id = $1
