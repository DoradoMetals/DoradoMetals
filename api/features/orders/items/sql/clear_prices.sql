-- Drop every line price on an order, so they can be recomputed.
UPDATE orders.items
   SET price = NULL
 WHERE order_id = $1
RETURNING id
