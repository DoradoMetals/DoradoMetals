SELECT id, address_id, user_id, recipient_name, label, default_shipping, default_billing
  FROM places.user_addresses
 WHERE address_id = $1 AND user_id = $2
