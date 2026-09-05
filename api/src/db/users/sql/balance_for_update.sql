SELECT dorado_funds
  FROM auth.users
 WHERE id = $1
   FOR UPDATE
