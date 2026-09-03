-- One method, by id - the WHOLE row: the fulfillment chain read serves this verbatim, so the audit columns ride along too.
SELECT
       id, type, label, direction, enabled, created_by, updated_by,
       created_at, updated_at, category, hidden, admin_label, is_default,
       created_by_id, updated_by_id
  FROM fulfillments.methods
 WHERE id = $1
 LIMIT 1
