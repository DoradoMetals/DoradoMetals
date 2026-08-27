-- The person's side of an address: their label for it and their defaults.
--
-- exchange has ONE is_default and the new schema has two, so both follow it.
-- Telling shipping and billing apart is a product change, not a migration one.
UPDATE places.user_addresses
   SET label = $1, default_shipping = $2, default_billing = $3
 WHERE address_id = $4 AND user_id = $5
RETURNING id, address_id, user_id, label, default_shipping, default_billing
