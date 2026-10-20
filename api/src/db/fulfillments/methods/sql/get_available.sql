-- The methods offered for a direction. A customer never sees a hidden method;
-- staff ($2) see every enabled one, the admin-only Own label and Walk in among
-- them.
SELECT
       id, type, label, admin_label, category, direction, enabled, hidden,
       is_default, created_at, updated_at
  FROM fulfillments.methods
 WHERE direction = $1::orders.direction
   AND enabled
   AND (NOT hidden OR $2::boolean)
 ORDER BY is_default DESC, category ASC, label ASC, id ASC
