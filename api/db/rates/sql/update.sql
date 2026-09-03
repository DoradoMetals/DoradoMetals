-- The one update (D212's CRUD ruling): every patchable column is
-- COALESCE($n, col), so a column absent from the patch keeps its value.
UPDATE rates.rates
   SET metal_id    = COALESCE($1, metal_id),
       unit        = COALESCE($2, unit),
       min_qty     = COALESCE($3, min_qty),
       max_qty     = COALESCE($4, max_qty),
       scrap_pct   = COALESCE($5, scrap_pct),
       bullion_pct = COALESCE($6, bullion_pct),
       created_by  = COALESCE($7, created_by),
       updated_by  = COALESCE($8, updated_by),
       updated_at  = NOW()
 WHERE id = $9
