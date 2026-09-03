-- What a customer may choose.
--
-- `hidden` is the column that says "this exists and is not on the menu" - OWN
-- LABEL and WALK IN are both enabled and hidden, because an admin can put an
-- order on them and a customer cannot ask for one.
--
-- direction is required rather than defaulted. The same type exists once per
-- direction and they are different rows; answering with both would let a sell
-- flow offer DROPSHIP, which is a sale's method.
--
-- The cast is `orders.direction` - the enum is schema-qualified and lives in
-- `orders`, not in `fulfillments`, because a direction is a property of the
-- order rather than of how it is handed over.
SELECT
       id, type, label, admin_label, category, direction, enabled, hidden,
       is_default, created_at, updated_at
  FROM fulfillments.methods
 WHERE direction = $1::orders.direction
   AND enabled
   AND NOT hidden
 ORDER BY is_default DESC, category ASC, label ASC, id ASC
