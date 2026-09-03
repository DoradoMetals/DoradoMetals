-- Confirm or unconfirm lines on an order, once someone has looked at the metal.
--
-- Scoped on the order as well as the ids, which is what exchange did.
UPDATE orders.items
   SET confirmed = $1
 WHERE order_id = $2
   AND id = ANY($3::uuid[])
RETURNING id, order_id, confirmed
