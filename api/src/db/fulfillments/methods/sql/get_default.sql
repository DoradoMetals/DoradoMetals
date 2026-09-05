SELECT
       id, type, label, admin_label, category, direction, enabled, hidden,
       is_default, created_at, updated_at
  FROM fulfillments.methods
 WHERE direction = $1::orders.direction
   AND category = $2::fulfillments.category
   AND is_default
   AND enabled
 ORDER BY id ASC
 LIMIT 1
