UPDATE checkout.items
   SET checkout_id = $2
 WHERE checkout_id = $1
