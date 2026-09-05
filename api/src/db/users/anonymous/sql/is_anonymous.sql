SELECT "isAnonymous" AS is_anonymous
  FROM auth.users
 WHERE id = $1
