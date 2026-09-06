SELECT id, address_id, user_id, recipient_name, label, default_shipping, default_billing
  FROM places.user_addresses
 WHERE user_id = $1
 ORDER BY default_shipping DESC NULLS LAST,
          default_billing  DESC NULLS LAST,
          label ASC NULLS LAST,
          id ASC
