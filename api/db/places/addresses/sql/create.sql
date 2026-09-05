INSERT INTO places.addresses
       (line_1, line_2, city, state, country, zip, country_code,
        phone_number, is_valid, is_residential)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *
