UPDATE places.user_addresses
   SET default_shipping = true,
       default_billing  = true
 WHERE user_id = $1
   AND address_id = $2
