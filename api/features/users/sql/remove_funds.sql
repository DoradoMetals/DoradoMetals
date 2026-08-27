-- Take from a customer's balance. See add_funds.sql.
UPDATE exchange.users
   SET dorado_funds = dorado_funds - $1
 WHERE id = $2
