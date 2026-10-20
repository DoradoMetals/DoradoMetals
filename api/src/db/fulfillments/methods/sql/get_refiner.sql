-- The methods for moving our own lots to a refinery: no customer direction.
SELECT
       id, type, label, admin_label, category, direction, enabled, hidden,
       is_default, created_at, updated_at
  FROM fulfillments.methods
 WHERE direction IS NULL
   AND enabled
 ORDER BY category ASC, label ASC, id ASC
