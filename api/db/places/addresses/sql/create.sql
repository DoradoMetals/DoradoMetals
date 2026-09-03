-- A new postal address. The id is supplied by the service so the user_addresses link can be written in the same transaction without reading it back.
INSERT INTO places.addresses
       (id, line_1, line_2, city, state, country, zip, country_code,
        phone_number, is_valid, is_residential)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
RETURNING id, line_1, line_2, city, state, country, zip, country_code,
          phone_number, created_at, updated_at, is_valid, is_residential
