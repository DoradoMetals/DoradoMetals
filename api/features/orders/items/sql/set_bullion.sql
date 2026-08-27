-- A bullion line's quantity and premium, from the admin's edit.
--
-- Keyed on the item alone, which is what exchange's updateBullion did. Left as
-- it was deliberately: the delete above got an ownership guard because it is
-- destructive and unrecoverable, and widening every UPDATE at the same time
-- would be a behaviour change hiding inside a migration.
UPDATE orders.items
   SET quantity = $1, premium = $2
 WHERE id = $3
RETURNING id, order_id, quantity, premium
