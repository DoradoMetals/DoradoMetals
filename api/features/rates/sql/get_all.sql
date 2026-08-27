-- Every row, newest first.
--
-- created_at is not unique, so id breaks the tie. Without a unique ORDER BY the
-- rows come back in physical order, which changes as rows are updated.
SELECT id, metal_id, unit, min_qty, max_qty, scrap_pct, bullion_pct,
       created_at, updated_at, created_by, updated_by
  FROM rates.rates
 ORDER BY created_at DESC, id DESC
