-- Move a customer's credit balance.
--
-- THE CASE HAS NO ELSE, and that is load-bearing: an unrecognised mode
-- evaluates to NULL, and dorado_funds is NOT NULL, so Postgres raises 23502 and
-- writes nothing rather than wiping a balance. The service also refuses an
-- unknown mode; this is the backstop underneath it, and it is the reason
-- audit:constraints exists.
UPDATE auth.users
   SET dorado_funds = CASE
         WHEN $2 = 'add'      THEN COALESCE(dorado_funds, 0) + $1
         WHEN $2 = 'subtract' THEN COALESCE(dorado_funds, 0) - $1
         WHEN $2 = 'edit'     THEN $1
       END
 WHERE id = $3
