UPDATE checkout.checkouts
   SET user_id = $2
 WHERE id = $1
