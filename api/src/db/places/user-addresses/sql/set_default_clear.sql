UPDATE places.user_addresses
   SET default_shipping = false,
       default_billing  = false
 WHERE user_id = $1
   AND address_id <> $2
   AND (default_shipping OR default_billing)
