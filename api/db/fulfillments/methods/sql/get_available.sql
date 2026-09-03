-- What a customer may choose. `hidden` means "exists but isn't on the menu" - e.g. Own Label/Walk In, which an admin can select but a customer can't.
-- direction is required, not defaulted: the same type exists once per direction as different rows, so defaulting could offer DROPSHIP (a sale's method) to a sell flow.
SELECT
       id, type, label, admin_label, category, direction, enabled, hidden,
       is_default, created_at, updated_at
  FROM fulfillments.methods
 WHERE direction = $1::orders.direction
   AND enabled
   AND NOT hidden
 ORDER BY is_default DESC, category ASC, label ASC, id ASC
