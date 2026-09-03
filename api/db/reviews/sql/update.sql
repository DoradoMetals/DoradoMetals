-- The one update (D212's CRUD ruling): every patchable column is
-- COALESCE($n, col), so a column absent from the patch keeps its value.
--
-- created_by is NOT assigned here. It is set once at creation and does not
-- move on an edit; updated_by is the actor the SERVICE passes, not a
-- column the caller's patch carries (Jacob's correction on this batch).
UPDATE reviews.reviews
   SET name        = COALESCE($1, name),
       review_text = COALESCE($2, review_text),
       rating      = COALESCE($3, rating),
       hidden      = COALESCE($4, hidden),
       updated_by  = COALESCE($5, updated_by),
       updated_at  = NOW()
 WHERE id = $6
