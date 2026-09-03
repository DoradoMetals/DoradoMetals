-- Every row, newest first. id breaks ties on created_at for a stable order.
SELECT id, metal_id, unit, min_qty, max_qty, scrap_pct, bullion_pct,
       created_at, updated_at, created_by, updated_by
  FROM rates.rates
 ORDER BY created_at DESC, id DESC
