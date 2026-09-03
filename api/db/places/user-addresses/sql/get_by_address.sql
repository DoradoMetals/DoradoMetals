-- Who has this address in their book. More than one person can - that is what
-- separating the address from the person makes possible - so this returns a
-- list and the caller decides.
SELECT id, address_id, user_id, label, default_shipping, default_billing
  FROM places.user_addresses
 WHERE address_id = $1
