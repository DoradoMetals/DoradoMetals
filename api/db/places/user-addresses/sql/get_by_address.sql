-- Who has this address in their book - more than one person can, so this returns a list and the caller decides.
SELECT id, address_id, user_id, recipient_name, label, default_shipping, default_billing
  FROM places.user_addresses
 WHERE address_id = $1
