-- Add to a customer's balance.
--
-- exchange.users, not auth.users: the mirror_users_to_auth trigger carries it
-- across. Writing both by hand applies the change twice - see service.ts.
UPDATE exchange.users
   SET dorado_funds = dorado_funds + $1
 WHERE id = $2
