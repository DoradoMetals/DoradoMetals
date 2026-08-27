-- One person's link to one address, which is also the ownership check: no row
-- means this address is not in that person's book.
SELECT id, address_id, user_id, label, default_shipping, default_billing
  FROM places.user_addresses
 WHERE address_id = $1 AND user_id = $2
