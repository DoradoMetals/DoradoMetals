-- Mirror of sql/adjust_credit.sql against the schema still serving as record of
-- truth. Same CASE, same missing ELSE, same reason.
UPDATE exchange.users
   SET dorado_funds = CASE
         WHEN $2 = 'add'      THEN COALESCE(dorado_funds, 0) + $1
         WHEN $2 = 'subtract' THEN COALESCE(dorado_funds, 0) - $1
         WHEN $2 = 'edit'     THEN $1
       END
 WHERE id = $3
-- RETURNING, so the caller does not have to read the row again to learn what it
-- became. The drawer displays this number; before D98 it displayed the one the
-- browser had computed, which is the same class of mistake as computing it.
RETURNING dorado_funds
