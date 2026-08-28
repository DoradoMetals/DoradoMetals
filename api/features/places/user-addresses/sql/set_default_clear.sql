-- Step one of two: the rest off. This used to be one UPDATE flipping every
-- row - `SET default_shipping = (address_id = $2)` - and that broke the day
-- migration 089's one-default-per-user index landed: a non-deferrable unique
-- index checks per row, so when the statement visited the new default before
-- the old one, the transient two-default state raised 23505. (A partial
-- unique index cannot be made deferrable, so the statement splits instead.)
-- Both flags follow exchange's single is_default - see update.sql.
UPDATE places.user_addresses
   SET default_shipping = false,
       default_billing  = false
 WHERE user_id = $1
   AND address_id <> $2
   AND (default_shipping OR default_billing)
