-- Whether anything still needs this address, asked before deleting it. Checks both orders.addresses columns (snapshot and source) - a delivered order must not lose where it went.
SELECT EXISTS (
         SELECT 1 FROM places.user_addresses WHERE address_id = $1
       ) OR EXISTS (
         SELECT 1 FROM orders.addresses
          WHERE source_address_id = $1 OR address_id = $1
       ) AS referenced
