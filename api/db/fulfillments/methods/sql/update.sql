-- Availability and wording only - type/category/direction are NOT updatable: changing a method's category would move existing fulfillments to a detail table their rows aren't in.
-- COALESCE leaves an untouched field alone; a `false` still lands since the parameter is only null when omitted. No create/delete: categories are code, not data.
UPDATE fulfillments.methods
   SET label         = coalesce($2, label),
       admin_label   = coalesce($3, admin_label),
       enabled       = coalesce($4, enabled),
       hidden        = coalesce($5, hidden)
 WHERE id = $1
RETURNING
          id, type, label, admin_label, category, direction, enabled, hidden,
          is_default, created_at, updated_at
