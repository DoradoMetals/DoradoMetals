-- Step one of two: the rest off. Split from one UPDATE because the partial unique index (one default per user) is non-deferrable and checks per row - visiting the new default before the old one raised 23505.
UPDATE places.user_addresses
   SET default_shipping = false,
       default_billing  = false
 WHERE user_id = $1
   AND address_id <> $2
   AND (default_shipping OR default_billing)
