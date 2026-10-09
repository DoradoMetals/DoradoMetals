SELECT p.id, p.metal_id, p.label, p.purity, p.sort_order, p.tolerance,
       p.created_at, p.updated_at, p.created_by_id, p.updated_by_id
  FROM metals.purity_labels p
  JOIN metals.metals m ON m.id = p.metal_id
 ORDER BY m.sort_order ASC, p.metal_id ASC, p.sort_order ASC
