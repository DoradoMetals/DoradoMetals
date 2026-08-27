-- What address validation decided. Written on its own because it is the only
-- path that sets is_valid and is_residential from anything but a default -
-- create and update both write is_residential false, which is what exchange
-- did and is preserved deliberately.
UPDATE places.addresses
   SET is_valid = $1, is_residential = $2, updated_at = NOW()
 WHERE id = $3
RETURNING id, line_1, line_2, city, state, country, zip, country_code,
          phone_number, created_at, updated_at, is_valid, is_residential
