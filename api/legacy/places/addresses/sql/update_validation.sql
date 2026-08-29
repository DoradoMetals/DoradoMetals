-- Mirror of sql/update_validation.sql.
UPDATE exchange.addresses
   SET is_valid = $1, is_residential = $2
 WHERE id = $3
RETURNING id
