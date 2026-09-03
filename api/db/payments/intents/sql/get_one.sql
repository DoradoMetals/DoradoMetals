-- One intent, by id.
--
-- Columns are listed rather than selected with *, so a column added to the
-- table does not reach a caller unannounced.
SELECT id, order_id, method_id, details_id, amount_expected, status,
       created_at, updated_at, created_by, updated_by,
       created_by_id, updated_by_id, session_id, user_id, type
  FROM payments.intents
 WHERE id = $1
