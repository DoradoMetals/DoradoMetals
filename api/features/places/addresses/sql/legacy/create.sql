-- The same address in the schema still serving as record of truth, which keeps
-- the owner, the label and one is_default on the address's own row.
--
-- is_valid is written TRUE and is_residential FALSE, which is what the create
-- this replaces did - literal values, not caller-supplied. Address validation
-- sets the real ones afterwards through update_validation.
INSERT INTO exchange.addresses
       (id, user_id, line_1, line_2, city, state, country, zip, name,
        is_default, phone_number, is_valid, country_code, is_residential)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
RETURNING id
