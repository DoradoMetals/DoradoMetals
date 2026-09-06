-- The Drop-off method row (167). It belongs to no customer direction - the
-- business drives its own lots to a refinery - so `get_default` cannot find it.
SELECT
       id, type, label, admin_label, category, direction, enabled, hidden,
       is_default, created_at, updated_at
  FROM fulfillments.methods
 WHERE category = 'DROPOFF'::fulfillments.category
   AND enabled
 ORDER BY id ASC
 LIMIT 1
