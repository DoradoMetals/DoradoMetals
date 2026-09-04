UPDATE auth.users
   SET dorado_funds = CASE
         WHEN $2 = 'add'      THEN COALESCE(dorado_funds, 0) + $1
         WHEN $2 = 'subtract' THEN COALESCE(dorado_funds, 0) - $1
         WHEN $2 = 'edit'     THEN $1
       END
 WHERE id = $3
RETURNING id, dorado_funds
