DELETE FROM orders.items
 WHERE order_id = $1
   AND id = $2
RETURNING id
