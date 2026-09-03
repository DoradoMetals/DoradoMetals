-- One line's premium. exchange's updatePremium, keyed on the item.
UPDATE orders.items
   SET premium = $1
 WHERE id = $2
RETURNING id, order_id, premium
