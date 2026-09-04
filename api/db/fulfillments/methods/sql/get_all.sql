SELECT
       id, type, label, admin_label, category, direction, enabled, hidden,
       is_default, created_at, updated_at
  FROM fulfillments.methods
 ORDER BY direction ASC, category ASC, label ASC, id ASC
