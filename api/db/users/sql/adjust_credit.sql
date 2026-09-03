-- Move a customer's credit balance. THE ONE WRITE THIS FEATURE MAKES.
--
-- *** auth.users, AND THE DIRECTION IS NOW THE SAME AS EVERY OTHER FEATURE. ***
--
-- This statement wrote exchange.users until migration 118. That was correct
-- while 056 (and then 107) made exchange the source of the balance and
-- auth.users a trigger-maintained copy: a balance written auth-side was
-- silently reverted by the next better-auth update of that row, which is how a
-- $1000 credit once vanished with no error raised.
--
-- 118 retires that mirror. auth.users owns every column of a user now - the
-- identity columns better-auth writes, and this one - so the balance is written
-- where it is read, and `exchange.users.dorado_funds` is frozen at its last
-- value rather than being fed. Reversing this means reversing 118; do not
-- re-point the table on its own, because with 118 applied an exchange write
-- reaches nobody.
--
-- THE STATEMENT NAMES ONLY dorado_funds, AND THAT IS LOAD-BEARING. 118 split
-- the identity mirror's trigger so its UPDATE half is `AFTER UPDATE OF <the
-- identity columns>`. A column-list trigger fires on the columns the statement
-- MENTIONS, so adding `"updatedAt" = now()` here would start writing
-- exchange.users again on every balance change - the back door 118 exists to
-- close.
--
-- THE CASE HAS NO ELSE, and that is load-bearing too: an unrecognised mode
-- evaluates to NULL, and dorado_funds is NOT NULL on auth.users as well
-- (migration 080 put it there for exactly this promotion), so Postgres raises
-- 23502 and writes nothing rather than wiping a balance. The service also
-- refuses an unknown mode; this is the backstop underneath it.
UPDATE auth.users
   SET dorado_funds = CASE
         WHEN $2 = 'add'      THEN COALESCE(dorado_funds, 0) + $1
         WHEN $2 = 'subtract' THEN COALESCE(dorado_funds, 0) - $1
         WHEN $2 = 'edit'     THEN $1
       END
 WHERE id = $3
-- RETURNING, so the caller does not have to read the row again to learn what it
-- became. The drawer displays this number; before D98 it displayed the one the
-- browser had computed, which is the same class of mistake as computing it.
RETURNING id, dorado_funds
