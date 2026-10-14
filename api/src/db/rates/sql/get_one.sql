SELECT r.id, r.metal_id, r.unit, r.min_qty, r.max_qty,
       r.scrap_pct, r.bullion_pct,
       r.created_at, r.updated_at, r.created_by_id, r.updated_by_id
  FROM rates.rates r
 WHERE r.id = $1
