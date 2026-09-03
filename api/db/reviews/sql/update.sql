-- The one update (D212's CRUD ruling): every patchable column is
-- COALESCE($n, col), so a column absent from the patch keeps its value.
UPDATE reviews.reviews
   SET name        = COALESCE($1, name),
       review_text = COALESCE($2, review_text),
       rating      = COALESCE($3, rating),
       hidden      = COALESCE($4, hidden),
       created_by  = COALESCE($5, created_by),
       updated_by  = COALESCE($6, updated_by),
       updated_at  = NOW()
 WHERE id = $7
