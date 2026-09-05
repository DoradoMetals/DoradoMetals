SELECT r.id, r.metal_id, r.unit, r.min_qty, r.max_qty,
       r.scrap_pct, r.bullion_pct,
       r.created_at, r.updated_at, r.created_by, r.updated_by
  FROM rates.rates r
 ORDER BY r.metal_id ASC, r.min_qty ASC, r.id ASC
