-- Mirror of the two new-schema updates, which exchange does in one statement
-- because it holds both halves on one row.
--
-- STILL SCOPED BY user_id, exactly as before. The new schema cannot be, so the
-- service checks ownership itself - but there is no reason to weaken this one,
-- and while exchange is the record of truth it is the check that matters most.
UPDATE exchange.addresses
   SET line_1 = $3,
       line_2 = $4,
       city = $5,
       state = $6,
       country = $7,
       zip = $8,
       name = $9,
       is_default = $10,
       phone_number = $11,
       country_code = $12,
       is_residential = $13
 WHERE id = $1 AND user_id = $2
RETURNING id
