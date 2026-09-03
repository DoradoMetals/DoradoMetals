-- Move a customer's credit balance. The one write this feature makes, to exchange.users (not auth.users) - migration 056's trigger mirrors the whole row into auth.users, so writing auth.users directly gets silently reverted on the next better-auth update and has lost real money before.
-- The CASE has no ELSE deliberately: an unrecognised mode evaluates to NULL, dorado_funds is NOT NULL, so Postgres raises 23502 and writes nothing rather than wiping a balance.
UPDATE exchange.users
   SET dorado_funds = CASE
         WHEN $2 = 'add'      THEN COALESCE(dorado_funds, 0) + $1
         WHEN $2 = 'subtract' THEN COALESCE(dorado_funds, 0) - $1
         WHEN $2 = 'edit'     THEN $1
       END
 WHERE id = $3
-- RETURNING so the caller displays this number rather than computing its own.
RETURNING dorado_funds
