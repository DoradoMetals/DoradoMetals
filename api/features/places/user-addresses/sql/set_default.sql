-- One address on, the rest off, for one user. Both flags follow exchange's
-- single is_default - see update.sql.
UPDATE places.user_addresses
   SET default_shipping = (address_id = $2),
       default_billing  = (address_id = $2)
 WHERE user_id = $1
