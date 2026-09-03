-- The one update (D212's CRUD ruling): every patchable column is
-- COALESCE($n, col), so a column absent from the patch keeps its value.
--
-- created_by is NOT assigned here - set once at creation, it does not move on
-- an edit; updated_by is the actor the SERVICE passes, not a column the
-- caller's patch carries (Jacob's correction on this batch).
UPDATE rates.rates
   SET metal_id    = COALESCE($1, metal_id),
       unit        = COALESCE($2, unit),
       min_qty     = COALESCE($3, min_qty),
       max_qty     = COALESCE($4, max_qty),
       scrap_pct   = COALESCE($5, scrap_pct),
       bullion_pct = COALESCE($6, bullion_pct),
       updated_by  = COALESCE($7, updated_by),
       updated_at  = NOW()
 WHERE id = $8
