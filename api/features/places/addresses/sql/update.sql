-- The postal parts of an address.
--
-- NOT SCOPED TO A USER, AND IT CANNOT BE. exchange's update was
-- `WHERE id = $1 AND user_id = $2` because the address carried its owner.
-- places.addresses has no user_id - that is the whole point of the split - so
-- the ownership check moves to the service, which reads the caller's
-- places.user_addresses link inside the same transaction and refuses first.
-- See the note in service.ts; losing that check would let any signed-in
-- customer rewrite any address by id.
UPDATE places.addresses
   SET line_1 = $1,
       line_2 = $2,
       city = $3,
       state = $4,
       country = $5,
       zip = $6,
       country_code = $7,
       phone_number = $8,
       is_residential = $9,
       updated_at = NOW()
 WHERE id = $10
RETURNING id, line_1, line_2, city, state, country, zip, country_code,
          phone_number, created_at, updated_at, is_valid, is_residential
