-- Several postal addresses, by id - one statement rather than one per address.
-- No ORDER BY: the sort key (default_shipping DESC, id ASC) is a column of the other table, so it lives in compose.ts.
SELECT id, line_1, line_2, city, state, country, zip, country_code,
       phone_number, created_at, updated_at, is_valid, is_residential
  FROM places.addresses
 WHERE id = ANY($1::uuid[])
