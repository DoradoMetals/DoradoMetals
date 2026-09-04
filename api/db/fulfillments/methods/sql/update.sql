UPDATE fulfillments.methods
   SET label         = coalesce($2, label),
       admin_label   = coalesce($3, admin_label),
       enabled       = coalesce($4, enabled),
       hidden        = coalesce($5, hidden)
 WHERE id = $1
RETURNING
          id, type, label, admin_label, category, direction, enabled, hidden,
          is_default, created_at, updated_at
