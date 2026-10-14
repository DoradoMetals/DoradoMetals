SELECT v.*
  FROM (/*__view__*/) v
  JOIN metals.metals m ON m.id = v.metal_id
 ORDER BY m.sort_order ASC, v.metal_id ASC, v.source_id ASC
