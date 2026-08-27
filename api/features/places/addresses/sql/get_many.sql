-- Several postal addresses, by id.
--
-- ONE statement rather than one per address: the list path reads a user's links
-- first and then the addresses they point at, and a query per row would be a
-- round trip per address in someone's address book.
--
-- No ORDER BY. The caller's order is `default_shipping DESC, id ASC`, and
-- default_shipping is a column of the OTHER table, so the sort lives in
-- compose.ts where both halves exist.
SELECT id, line_1, line_2, city, state, country, zip, country_code,
       phone_number, created_at, updated_at, is_valid, is_residential
  FROM places.addresses
 WHERE id = ANY($1::uuid[])
