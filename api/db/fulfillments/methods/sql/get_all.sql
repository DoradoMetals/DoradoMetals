-- Everything, hidden and disabled included, for the admin side. id breaks the
-- tie so two callers reading the same rows get them in the same order.
SELECT
       id, type, label, admin_label, category, direction, enabled, hidden,
       is_default, created_at, updated_at
  FROM fulfillments.methods
 ORDER BY direction ASC, category ASC, label ASC, id ASC
