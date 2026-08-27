-- One postal address, by id.
--
-- A postal address has no owner - places.addresses is somewhere on earth.
-- Whose address book it is in lives in places.user_addresses, and the two are
-- put together in compose.ts.
SELECT id, line_1, line_2, city, state, country, zip, country_code,
       phone_number, created_at, updated_at, is_valid, is_residential
  FROM places.addresses
 WHERE id = $1
