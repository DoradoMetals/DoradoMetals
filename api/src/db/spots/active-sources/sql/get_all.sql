SELECT a.metal_id, a.source_id,
       a.created_at, a.updated_at, a.created_by, a.updated_by,
       a.created_by_id, a.updated_by_id
  FROM spots.active_sources a
  JOIN metals.metals m ON m.id = a.metal_id
 ORDER BY m.sort_order ASC, a.metal_id ASC
