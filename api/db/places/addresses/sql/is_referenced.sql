-- Whether anything still needs this postal address.
--
-- Asked before deleting it. orders.addresses records both the snapshot it took
-- and the address book row it came from, so both columns are checked - a
-- delivered order that points at a deleted address would lose where it went.
SELECT EXISTS (
         SELECT 1 FROM places.user_addresses WHERE address_id = $1
       ) OR EXISTS (
         SELECT 1 FROM orders.addresses
          WHERE source_address_id = $1 OR address_id = $1
       ) AS referenced
