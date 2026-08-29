-- One address on, the rest off, for one user - in a single statement, which is
-- how exchange has always done it.
UPDATE exchange.addresses
   SET is_default = CASE WHEN id = $2 THEN TRUE ELSE FALSE END
 WHERE user_id = $1
