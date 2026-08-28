-- Step two: the one on. See set_default_clear.sql for why this is not one
-- statement.
UPDATE places.user_addresses
   SET default_shipping = true,
       default_billing  = true
 WHERE user_id = $1
   AND address_id = $2
