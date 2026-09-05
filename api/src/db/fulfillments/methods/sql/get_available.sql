SELECT
       id, type, label, admin_label, category, direction, enabled, hidden,
       is_default, created_at, updated_at
  FROM fulfillments.methods
 WHERE direction = $1::orders.direction
   AND enabled
   AND NOT hidden
 ORDER BY is_default DESC, category ASC, label ASC, id ASC
