-- The refiner's own premium for a line.
--
-- A DIFFERENT TABLE, and that is the whole point of this file.
-- exchange.purchase_order_items carried both premiums side by side - `premium`,
-- ours, and `refiner_premium`, theirs. The new schema splits them: ours stays
-- on orders.items, theirs moves to refiners.items, which is where everything
-- the refiner quoted lives.
--
-- Keyed on order_item_id, because a refiners.items row hangs off the order line
-- rather than replacing it.
UPDATE refiners.items
   SET premium = $1
 WHERE order_item_id = $2
RETURNING id, order_item_id, premium
