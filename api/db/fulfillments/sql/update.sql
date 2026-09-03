-- ONE COLLAPSE (D212's CRUD ruling): replaces set_status.sql and
-- set_method.sql, which were the same UPDATE against the same table under
-- two names.
--
-- updated_by_id is COALESCEd rather than assigned: a status or method moved
-- by a background job should not blank out the admin who last touched it.
UPDATE fulfillments.fulfillments
   SET status = COALESCE($1, status),
       method_id = COALESCE($2, method_id),
       updated_at = now(),
       updated_by_id = coalesce($3, updated_by_id)
 WHERE id = $4
